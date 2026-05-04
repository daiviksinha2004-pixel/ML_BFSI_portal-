"""
Service layer for lapse prediction endpoint.
Implements business logic for predicting paid policies based on historical data.
"""
from typing import List, Dict, Tuple, Optional
from datetime import datetime, date
from dateutil.relativedelta import relativedelta
import logging
import pandas as pd
import numpy as np
from sqlalchemy import func

from app.models.insurance import LifeCampaignRecord
from app.schemas.lapse_prediction import (
    LapsePredictionResponse,
    PredictionSummary,
    ProductGroupPrediction,
    LapseBandBreakdown,
    ReferenceMonthDetail,
    ProductGroupPaidPct,
)

logger = logging.getLogger(__name__)


class LapsePredictionService:
    """Service for lapse prediction and forecasting."""
    
    # Lapse aging bands in days
    LAPSE_AGING_BANDS = [
        (0, 30, "0-30"),
        (30, 60, "30-60"),
        (60, 90, "60-90"),
        (90, 120, "90-120"),
        (120, 150, "120-150"),
        (150, 180, "150-180"),
        (180, 210, "180-210"),
        (210, 240, "210-240"),
        (240, 270, "240-270"),
        (270, 300, "270-300"),
        (300, 330, "300-330"),
        (330, 360, "330-360"),
        (360, float('inf'), "360+"),
    ]
    
    # Policy aging bands in years
    POLICY_AGING_BANDS = [
        (0, 1, "0-1"),
        (1, 2, "1-2"),
        (2, 3, "2-3"),
        (3, 4, "3-4"),
        (4, 5, "4-5"),
        (5, 6, "5-6"),
        (6, 7, "6-7"),
        (7, 8, "7-8"),
        (8, 9, "8-9"),
        (9, 10, "9-10"),
        (10, float('inf'), "10+"),
    ]
    
    # -------------------------------------------------------------------------
    # Recency weights for reference months: T-1 (most recent) → T-4 (oldest).
    # Recent months are more predictive of next-month conversion behaviour.
    # -------------------------------------------------------------------------
    MONTH_WEIGHTS: List[float] = [4.0, 3.0, 2.0, 1.5]

    # Lapse bands beyond this threshold are considered unrecoverable.
    # Policies lapsed > 360 days almost never convert; excluding them
    # prevents phantom exposure from inflating the prediction denominator.
    MAX_RECOVERABLE_LAPSE_DAYS = 360

    # Conversion-rate damping factor (0 < d <= 1).  Historical paid rates
    # can be slightly optimistic because they include early-resolved
    # easy-to-collect policies.  Light damping provides a small conservative
    # correction without over-discounting the historical signal.
    CONVERSION_DAMPING = 0.95

    def __init__(self, db_session):
        self.db = db_session
    
    def get_lapse_aging_band(self, days: int) -> str:
        """Get lapse aging band based on days."""
        for min_days, max_days, band_name in self.LAPSE_AGING_BANDS:
            if min_days <= days < max_days:
                return band_name
        return "Unknown"
    
    def get_policy_aging_band(self, years: float) -> str:
        """Get policy aging band based on years."""
        for min_years, max_years, band_name in self.POLICY_AGING_BANDS:
            if min_years <= years < max_years:
                return band_name
        return "Unknown"
    
    def get_reference_months(self, target_month: str) -> List[str]:
        """
        Get the four reference months for prediction.
        
        Given target_month T (e.g., 2026-04):
        - T - 1 month
        - T - 2 months
        - T - 3 months
        - T - 12 months (same month last year)
        """
        target_date = datetime.strptime(target_month, "%Y-%m")
        
        ref_months = [
            (target_date - relativedelta(months=1)).strftime("%Y-%m"),
            (target_date - relativedelta(months=2)).strftime("%Y-%m"),
            (target_date - relativedelta(months=3)).strftime("%Y-%m"),
            (target_date - relativedelta(months=4)).strftime("%Y-%m"),
        ]
        
        return ref_months
    
    def fetch_month_data(self, month: str, tenant_id: str) -> pd.DataFrame:
        """
        Fetch data for a specific month from the database.
        
        Returns DataFrame with columns: productgroup, policy_issue_date, paid_to_date, pmt_flag, act_premium
        """
        month_date = datetime.strptime(month, "%Y-%m")
        
        try:
            self.db.rollback()
        except:
            pass
        
        query = self.db.query(
            LifeCampaignRecord.policy_no,
            LifeCampaignRecord.lot_date,
            LifeCampaignRecord.productgroup,
            LifeCampaignRecord.policy_issue_date,
            LifeCampaignRecord.paid_to_date,
            LifeCampaignRecord.pmt_flag,
            LifeCampaignRecord.act_premium,
            LifeCampaignRecord.outstanding_premium,
        ).filter(
            LifeCampaignRecord.tenant_id == tenant_id,
            LifeCampaignRecord.policy_issue_date.isnot(None),
            LifeCampaignRecord.paid_to_date.isnot(None)
        )
        
        # Filter by allocated_month if column exists
        if hasattr(LifeCampaignRecord, 'dataset_month'):
            query = query.filter(
                func.date_trunc('month', LifeCampaignRecord.dataset_month) == month_date
            )
        else:
            # If no dataset_month, assume all records belong to the target month
            pass
        
        results = query.all()
        
        # Convert to DataFrame
        data = []
        for row in results:
            data.append({
                'policy_no': row.policy_no,
                'lot_date': row.lot_date,
                'productgroup': row.productgroup or 'Unknown',
                'policy_issue_date': row.policy_issue_date,
                'paid_to_date': row.paid_to_date,
                'pmt_flag': row.pmt_flag or False,
                'act_premium': row.act_premium or 0,
                'outstanding_premium': row.outstanding_premium or 0,
            })
        df = pd.DataFrame(data)
        if df.empty:
            return df

        # Keep one row per policy per month (latest lot_date snapshot) to avoid duplicate exposure inflation.
        if 'policy_no' in df.columns and df['policy_no'].notna().any():
            df = (
                df.sort_values(by=['policy_no', 'lot_date'])
                  .drop_duplicates(subset=['policy_no'], keep='last')
                  .reset_index(drop=True)
            )

        return df
    
    def calculate_aging_fields(self, df: pd.DataFrame, target_month: str) -> pd.DataFrame:
        """
        STEP 1: Derive calculated fields per record.
        
        For each record:
        - lapse_aging = (first day of target_month) - paid_to_date (in days)
        - policy_aging = paid_to_date - policy_issue_date (in days, then convert to years)
        """
        target_date = datetime.strptime(target_month, "%Y-%m")
        
        # Convert dates to datetime objects if needed
        df['policy_issue_date'] = pd.to_datetime(df['policy_issue_date'])
        df['paid_to_date'] = pd.to_datetime(df['paid_to_date'])
        
        # Handle date/datetime mismatch - convert all to datetime
        df['policy_issue_date'] = pd.to_datetime(df['policy_issue_date'])
        df['paid_to_date'] = pd.to_datetime(df['paid_to_date'])
        
        # Calculate lapse aging in days
        df['lapse_aging_days'] = (target_date - df['paid_to_date']).dt.days
        
        # Filter out negative lapse aging with warning
        negative_lapse = df['lapse_aging_days'] < 0
        if negative_lapse.sum() > 0:
            logger.warning(f"Excluding {negative_lapse.sum()} records with negative lapse aging")
            df = df[~negative_lapse]
        
        # Calculate policy aging in days, then convert to years
        df['policy_aging_days'] = (df['paid_to_date'] - df['policy_issue_date']).dt.days
        df['policy_aging_years'] = df['policy_aging_days'] / 365.25
        
        return df
    
    def apply_aging_bands(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        STEP 2: Create aging bands.
        
        Apply lapse_aging_band and policy_aging_band to each record.
        """
        df['lapse_aging_band'] = df['lapse_aging_days'].apply(self.get_lapse_aging_band)
        df['policy_aging_band'] = df['policy_aging_years'].apply(self.get_policy_aging_band)
        
        return df
    
    def compute_paid_counts_by_group(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        STEP 3: Compute raw counts per group for a single month.
        
        Group by product_group → lapse_aging_band
        Calculate total and paid counts for each cell
        """
        if df.empty:
            return pd.DataFrame(columns=['productgroup', 'lapse_aging_band', 'total_count', 'paid_count'])
        
        # Group by (product_group, lapse_aging_band)
        grouped = df.groupby(['productgroup', 'lapse_aging_band']).agg({
            'pmt_flag': ['count', 'sum']
        }).reset_index()
        
        grouped.columns = ['productgroup', 'lapse_aging_band', 'total_count', 'paid_count']
        
        return grouped
    
    def get_avg_ticket_size_by_product_group(
        self,
        months: List[str],
        tenant_id: str
    ) -> Dict[str, float]:
        """
        Calculate average ticket size (premium per policy) per product group across given months.
        
        Args:
            months: List of month strings in format "YYYY-MM"
            tenant_id: Tenant ID for filtering
        
        Returns:
            Dict mapping product_group to average ticket size (float)
        """
        if not months:
            return {}
        
        # Parse months to date objects
        month_dates = [datetime.strptime(m, "%Y-%m") for m in months]
        
        try:
            self.db.rollback()
        except:
            pass
        
        # Build query grouped by productgroup
        query = self.db.query(
            LifeCampaignRecord.productgroup,
            func.sum(LifeCampaignRecord.act_premium).label('total_premium'),
            func.count(LifeCampaignRecord.id).label('total_policies')
        ).filter(
            LifeCampaignRecord.tenant_id == tenant_id,
            func.date_trunc('month', LifeCampaignRecord.dataset_month).in_(month_dates),
            LifeCampaignRecord.act_premium.isnot(None)
        ).group_by(LifeCampaignRecord.productgroup)
        
        results = query.all()
        
        ticket_sizes = {}
        for row in results:
            pg = row.productgroup or 'Unknown'
            total_policies = row.total_policies or 0
            if total_policies > 0:
                ticket_sizes[pg] = float((row.total_premium or 0) / total_policies)
            else:
                ticket_sizes[pg] = 0.0
                
        return ticket_sizes

    def get_robust_ticket_size_by_product_group(
        self,
        months: List[str],
        tenant_id: str
    ) -> Dict[str, float]:
        """
        Estimate collectible amount per converted policy using robust statistics.

        - Uses only historically converted rows (pmt_flag = True)
        - Deduplicates per month/policy via fetch_month_data
        - Builds per-policy effective ticket from available premium fields
        - Uses winsorized median to reduce outlier impact
        """
        if not months:
            return {}

        by_pg: Dict[str, List[float]] = {}
        for month in months:
            df = self.fetch_month_data(month, tenant_id)
            if df.empty:
                continue

            paid_df = df[df['pmt_flag'] == True].copy()
            if paid_df.empty:
                continue

            paid_df['act_premium'] = pd.to_numeric(paid_df['act_premium'], errors='coerce').fillna(0.0)
            paid_df['outstanding_premium'] = pd.to_numeric(
                paid_df['outstanding_premium'], errors='coerce'
            ).fillna(0.0)

            # Effective amount per converted policy: use act_premium as the
            # primary basis since it represents the actual premium amount
            # collectible when a lapsed policy converts.  Fall back to
            # outstanding_premium only when act_premium is unavailable.
            paid_df['effective_ticket'] = np.where(
                paid_df['act_premium'] > 0,
                paid_df['act_premium'],
                paid_df['outstanding_premium']
            )

            paid_df = paid_df[paid_df['effective_ticket'] > 0]
            if paid_df.empty:
                continue

            for pg, grp in paid_df.groupby('productgroup'):
                values = grp['effective_ticket'].tolist()
                by_pg.setdefault(pg or 'Unknown', []).extend(values)

        robust_ticket_sizes: Dict[str, float] = {}
        for pg, values in by_pg.items():
            arr = np.array(values, dtype=float)
            arr = arr[np.isfinite(arr) & (arr > 0)]
            if arr.size == 0:
                continue

            if arr.size >= 5:
                p5  = float(np.percentile(arr, 5))
                p95 = float(np.percentile(arr, 95))
                clipped = arr[(arr >= p5) & (arr <= p95)]
                if clipped.size > 0:
                    arr = clipped

            # Use 60th percentile instead of median — the premium
            # distribution is right-skewed and the median under-estimates
            # the average collection realized on conversion.
            robust_ticket_sizes[pg] = float(np.percentile(arr, 60))

        return robust_ticket_sizes
    
    def get_historical_avg_paid_pct(
        self,
        reference_months: List[str],
        tenant_id: str
    ) -> Tuple[Dict[str, float], Dict[Tuple[str, str], float], List[ReferenceMonthDetail]]:
        """
        STEP 4 & 5: Get historical **recency-weighted** average paid %.

        Each reference month is weighted by MONTH_WEIGHTS so that the most
        recent month (T-1) has the greatest influence on the blended rate.

        Returns:
        1. historical_avg_by_pg: Recency-weighted avg per product_group
        2. historical_avg_by_band: Recency-weighted avg per (product_group, lapse_aging_band)
        3. reference_details: Summary per month for UI
        """
        reference_details = []
        weights = self.MONTH_WEIGHTS
        
        # Weighted accumulators
        band_totals = {}  # (pg, band) -> {'total': 0, 'paid': 0}
        pg_totals = {}    # pg -> {'total': 0, 'paid': 0}
        
        for month_idx, month in enumerate(reference_months):
            w = weights[month_idx] if month_idx < len(weights) else 1.0
            try:
                df = self.fetch_month_data(month, tenant_id)
                if df.empty:
                    logger.warning(f"No data found for reference month {month}")
                    continue
                
                df = self.calculate_aging_fields(df, month)
                df = self.apply_aging_bands(df)
                counts_df = self.compute_paid_counts_by_group(df)
                
                # Compute product group monthly averages for reference details
                monthly_pg_stats = {}
                for _, row in counts_df.iterrows():
                    pg = row['productgroup']
                    band = row['lapse_aging_band']
                    total = float(row['total_count'])
                    paid = float(row['paid_count'])
                    
                    if pg not in monthly_pg_stats:
                        monthly_pg_stats[pg] = {'total': 0, 'paid': 0}
                    monthly_pg_stats[pg]['total'] += total
                    monthly_pg_stats[pg]['paid'] += paid
                    
                    # Accumulate with recency weight
                    if pg not in pg_totals:
                        pg_totals[pg] = {'total': 0.0, 'paid': 0.0}
                    pg_totals[pg]['total'] += total * w
                    pg_totals[pg]['paid']  += paid  * w
                    
                    band_key = (pg, band)
                    if band_key not in band_totals:
                        band_totals[band_key] = {'total': 0.0, 'paid': 0.0}
                    band_totals[band_key]['total'] += total * w
                    band_totals[band_key]['paid']  += paid  * w
                
                # Store for reference details (raw, unweighted for display)
                product_group_paid_pct = []
                for pg, stats in monthly_pg_stats.items():
                    pct = (stats['paid'] / stats['total'] * 100) if stats['total'] > 0 else 0
                    product_group_paid_pct.append(ProductGroupPaidPct(product_group=pg, avg_paid_pct=round(pct, 2)))
                
                reference_details.append(ReferenceMonthDetail(month=month, product_group_paid_pct=product_group_paid_pct))
                
            except Exception as e:
                logger.warning(f"Failed to process reference month {month}: {e}")
                continue
        
        # Calculate recency-weighted historical averages
        historical_avg_by_pg = {}
        for pg, stats in pg_totals.items():
            raw_rate = (stats['paid'] / stats['total'] * 100) if stats['total'] > 0 else 0
            historical_avg_by_pg[pg] = raw_rate
            
        historical_avg_by_band = {}
        for band_key, stats in band_totals.items():
            raw_rate = (stats['paid'] / stats['total'] * 100) if stats['total'] > 0 else 0
            historical_avg_by_band[band_key] = raw_rate
        
        return historical_avg_by_pg, historical_avg_by_band, reference_details
    
    def get_target_month_policy_counts(
        self,
        target_month: str,
        tenant_id: str
    ) -> pd.DataFrame:
        """
        STEP 6: Get target month policy counts by lapse band.
        
        For target month, compute lapse_aging and lapse_aging_band
        Group by (product_group, lapse_aging_band) → get policy_count

        Policies beyond MAX_RECOVERABLE_LAPSE_DAYS are excluded from the
        prediction exposure base — they have near-zero conversion probability
        and would otherwise inflate the total without contributing to paid.
        """
        df = self.fetch_month_data(target_month, tenant_id)
        
        if df.empty:
            return pd.DataFrame()

        # Prediction base should be unresolved exposure only; already-paid rows are not future conversion candidates.
        df = df[df['pmt_flag'] != True].copy()
        if df.empty:
            return pd.DataFrame()
        
        df = self.calculate_aging_fields(df, target_month)
        df['lapse_aging_band'] = df['lapse_aging_days'].apply(self.get_lapse_aging_band)

        # Exclude very old lapse bands (unrecoverable exposure)
        df = df[df['lapse_aging_days'] <= self.MAX_RECOVERABLE_LAPSE_DAYS].copy()
        if df.empty:
            return pd.DataFrame()
        
        # Group by (product_group, lapse_aging_band)
        grouped = df.groupby(['productgroup', 'lapse_aging_band']).size().reset_index(name='policy_count')
        
        return grouped
    
    def generate_prediction(
        self,
        target_month: str,
        tenant_id: str
    ) -> LapsePredictionResponse:
        """
        Main prediction method implementing all steps.
        """
        # Validate target month
        try:
            datetime.strptime(target_month, "%Y-%m")
        except ValueError:
            raise ValueError("Invalid target_month format. Use YYYY-MM")
        
        # STEP 4: Get reference months
        reference_months = self.get_reference_months(target_month)
        
        # STEP 5: Get historical average paid %
        historical_avg_by_pg, historical_avg_by_band, reference_details = self.get_historical_avg_paid_pct(
            reference_months, tenant_id
        )
        
        if not historical_avg_by_pg:
            raise ValueError("No historical data available for reference months")
        
        # STEP 5.5: Get average ticket size per product group
        ticket_sizes = self.get_robust_ticket_size_by_product_group(
            months=reference_months,
            tenant_id=tenant_id
        )
        
        # STEP 6: Get target month policy counts
        target_counts = self.get_target_month_policy_counts(target_month, tenant_id)
        
        if target_counts.empty:
            raise ValueError(f"No data found for target month {target_month}")
        
        # STEP 7: Apply band-level historical paid % to get prediction
        # Apply CONVERSION_DAMPING to compensate for the systematic upward
        # bias in historical rates (historically, the easy-to-collect
        # policies are captured first, so forward-looking conversion is lower).
        damping = self.CONVERSION_DAMPING

        by_product_group = []
        overall_predicted_paid = 0
        overall_total_policies = 0
        overall_predicted_amount = 0
        
        for product_group in target_counts['productgroup'].unique():
            pg_data = target_counts[target_counts['productgroup'] == product_group]
            
            # This is only used for UI display, actual prediction happens at band level
            overall_hist_paid_pct = historical_avg_by_pg.get(product_group, 0)
            ticket_size = ticket_sizes.get(product_group, 0.0)
            
            lapse_band_breakdown = []
            total_predicted_paid_pg = 0
            total_policy_count_pg = 0
            total_predicted_amount_pg = 0
            
            for _, row in pg_data.iterrows():
                lapse_band = row['lapse_aging_band']
                policy_count = row['policy_count']
                
                # Fetch band-level historical rate (fallback to product group rate if unseen)
                band_hist_paid_pct = historical_avg_by_band.get((product_group, lapse_band), overall_hist_paid_pct)

                # Apply per-band decay damping: older lapse bands get
                # progressively heavier damping because their conversion
                # probability declines faster than the historical average.
                band_lower = 0
                try:
                    band_lower = int(lapse_band.split('-')[0].replace('+', ''))
                except (ValueError, IndexError):
                    pass
                band_decay = 1.0
                if band_lower >= 180:
                    band_decay = 0.78  # deep-lapse: moderate discount
                elif band_lower >= 90:
                    band_decay = 0.90  # mid-lapse: light discount

                effective_rate = band_hist_paid_pct * damping * band_decay
                
                predicted_paid = effective_rate / 100 * policy_count
                predicted_amount = predicted_paid * ticket_size
                
                lapse_band_breakdown.append(LapseBandBreakdown(
                    lapse_aging_band=lapse_band,
                    policy_count=policy_count,
                    historical_avg_paid_pct=round(band_hist_paid_pct, 2),
                    predicted_paid_count=round(predicted_paid, 2),
                    predicted_collected_amount=round(predicted_amount, 2)
                ))
                
                total_predicted_paid_pg += predicted_paid
                total_policy_count_pg += policy_count
                total_predicted_amount_pg += predicted_amount
            
            predicted_paid_pct_pg = (total_predicted_paid_pg / total_policy_count_pg * 100) if total_policy_count_pg > 0 else 0
            
            by_product_group.append(ProductGroupPrediction(
                product_group=product_group,
                historical_avg_paid_pct=round(overall_hist_paid_pct, 2),
                total_policy_count=total_policy_count_pg,
                predicted_paid_count=round(total_predicted_paid_pg, 2),
                predicted_paid_pct=round(predicted_paid_pct_pg, 2),
                predicted_collected_amount=round(total_predicted_amount_pg, 2),
                lapse_band_breakdown=lapse_band_breakdown
            ))
            
            overall_predicted_paid += total_predicted_paid_pg
            overall_total_policies += total_policy_count_pg
            overall_predicted_amount += total_predicted_amount_pg
        
        # STEP 8: Overall prediction
        overall_predicted_paid_pct = (overall_predicted_paid / overall_total_policies * 100) if overall_total_policies > 0 else 0
        
        summary = PredictionSummary(
            overall_predicted_paid_count=round(overall_predicted_paid, 2),
            overall_total_policy_count=overall_total_policies,
            overall_predicted_paid_pct=round(overall_predicted_paid_pct, 2),
            overall_predicted_collected_amount=round(overall_predicted_amount, 2)
        )
        
        return LapsePredictionResponse(
            target_month=target_month,
            reference_months=reference_months,
            summary=summary,
            by_product_group=by_product_group,
            reference_month_details=reference_details
        )
