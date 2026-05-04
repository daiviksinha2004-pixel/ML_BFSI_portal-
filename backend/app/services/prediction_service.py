"""
Service layer for lapse prediction and KPI forecasting.
Implements business logic for forecasting using recency-weighted rolling averages.

Reliability improvements over v1:
- Rolling averages are recency-weighted: T-1 > T-2 > T-3 > T-12(seasonal).
- Bayesian shrinkage blends sparse band cells toward the product-group prior.
- Fallback hierarchy: 3-key → 2-key → pg → overall → 0.
- Low-confidence cells are flagged via sample count metadata.
"""

from typing import List, Dict, Tuple, Optional
from sqlalchemy.orm import Session
from datetime import datetime
import logging

from app.repositories.prediction_repository import PredictionRepository
from app.utils.date_utils import get_last_4_months, get_first_day_of_month
from app.schemas.prediction_schema import (
    LapseForecastRequest,
    LapseForecastResponse,
    ProductGroupSummary,
    BandLevelForecast,
    MonthlyBreakdown,
)

logger = logging.getLogger(__name__)


class PredictionService:
    """Service for lapse prediction and KPI forecasting."""

    # -------------------------------------------------------------------------
    # Reliability parameters
    # -------------------------------------------------------------------------

    # Weights for the four comparison months returned by get_last_4_months.
    # Index 0 = most recent (T-1), index 3 = T-12 (seasonal anchor).
    # Adjust these to shift emphasis between recency and seasonality.
    MONTH_WEIGHTS: List[float] = [4.0, 3.0, 2.0, 2.0]

    # Credibility constant for Bayesian shrinkage.
    # A band needs ~CREDIBILITY_N observations to receive 50 % weight on its
    # own rate vs the product-group prior.
    CREDIBILITY_N: float = 20.0

    # Raw observation threshold below which we flag a cell as low-confidence.
    MIN_RELIABLE_N: int = 10

    def __init__(self, db: Session, tenant_id: str):
        self.db        = db
        self.tenant_id = tenant_id
        self.repository = PredictionRepository(db, tenant_id)

    # -------------------------------------------------------------------------
    # Public entry point
    # -------------------------------------------------------------------------

    def generate_lapse_forecast(
        self, request: LapseForecastRequest
    ) -> LapseForecastResponse:
        """
        Generate lapse forecast for the target month.

        Steps:
        1.  Determine four comparison months (T-1, T-2, T-3, T-12).
        2.  Fetch monthly aggregated data for each comparison month.
        3.  Build recency-weighted rolling averages with Bayesian shrinkage.
        4.  Fetch target-month exposure (unpaid policies only).
        5.  Generate band-level forecast with fallback hierarchy.
        6.  Summarise by product group.
        """
        # Step 1: comparison months
        comparison_months = get_last_4_months(request.target_month)
        logger.info(
            "Comparison months for %s: %s", request.target_month, comparison_months
        )

        as_of_date = get_first_day_of_month(request.target_month)

        # Step 2: fetch monthly data
        monthly_data: Dict[str, List[Dict]] = {}
        monthly_breakdown: List[MonthlyBreakdown] = []

        for month in comparison_months:
            try:
                data = self.repository.get_monthly_aggregated_data(
                    month=month,
                    product_groups=request.product_groups,
                    as_of_date=as_of_date,
                )
                monthly_data[month] = data

                for row in data:
                    monthly_breakdown.append(
                        MonthlyBreakdown(
                            month=month,
                            product_group=row["product_group"],
                            policy_aging_band=row["policy_aging_band"],
                            lapse_aging_band=row["lapse_aging_band"],
                            total_policy_count=row["total_policy_count"],
                            paid_policy_count=row["paid_policy_count"],
                            paid_percentage=row["paid_percentage"],
                        )
                    )
            except Exception as exc:
                logger.warning("Failed to fetch data for month %s: %s", month, exc)
                monthly_data[month] = []

        # Step 3: recency-weighted rolling averages + Bayesian shrinkage
        rolling_averages, two_key_averages, pg_averages, sample_counts = (
            self._calculate_rolling_averages(monthly_data, comparison_months)
        )

        # Step 4: average ticket size per product group
        ticket_sizes = self.repository.get_avg_ticket_size_by_product_group(
            months=comparison_months,
            product_groups=request.product_groups,
        )

        # Step 5: target month exposure
        target_data = self.repository.get_target_month_data(
            target_month=request.target_month,
            product_groups=request.product_groups,
            as_of_date=as_of_date,
        )

        # Step 6: generate forecast
        band_level_forecast = self._generate_band_forecast(
            target_data=target_data,
            rolling_averages=rolling_averages,
            two_key_averages=two_key_averages,
            pg_averages=pg_averages,
            sample_counts=sample_counts,
            ticket_sizes=ticket_sizes,
        )

        # Step 7: summarise
        summary_by_product_group = self._summarize_by_product_group(band_level_forecast)

        return LapseForecastResponse(
            target_month=request.target_month,
            comparison_months=comparison_months,
            summary_by_product_group=summary_by_product_group,
            band_level_forecast=band_level_forecast,
            monthly_breakdown=monthly_breakdown,
        )

    # -------------------------------------------------------------------------
    # Internal: rolling averages
    # -------------------------------------------------------------------------

    def _calculate_rolling_averages(
        self,
        monthly_data: Dict[str, List[Dict]],
        month_order: List[str],
    ) -> Tuple[
        Dict[Tuple[str, str, str], float],   # 3-key (pg, pol_band, lapse_band), shrunk
        Dict[Tuple[str, str], float],         # 2-key (pg, lapse_band)
        Dict[str, float],                     # pg-level
        Dict[Tuple[str, str, str], int],      # raw sample counts per 3-key
    ]:
        """
        Build recency-weighted, Bayesian-shrunk rate tables.

        Months in month_order[0] (most recent) get weight MONTH_WEIGHTS[0]; the
        last entry (T-12) gets weight MONTH_WEIGHTS[3].  Each observation count
        is multiplied by its month's weight before accumulation, giving a
        volume-weighted-and-recency-adjusted average.

        After accumulation, the 3-key rate for each cell is shrunk toward the
        product-group prior proportional to the observed sample size.
        """
        weights = self.MONTH_WEIGHTS

        # Weighted accumulators
        # 3-key: (product_group, policy_aging_band, lapse_aging_band)
        three_key: Dict[Tuple[str, str, str], Dict[str, float]] = {}
        # 2-key: (product_group, lapse_aging_band)
        two_key:   Dict[Tuple[str, str], Dict[str, float]] = {}
        # pg-level
        pg_acc:    Dict[str, Dict[str, float]] = {}
        # raw (unweighted) counts for confidence flagging
        raw_counts: Dict[Tuple[str, str, str], int] = {}

        for idx, month in enumerate(month_order):
            w    = weights[idx] if idx < len(weights) else 1.0
            data = monthly_data.get(month, [])

            for row in data:
                pg    = row["product_group"]
                pb    = row["policy_aging_band"]
                lb    = row["lapse_aging_band"]
                total = float(row["total_policy_count"])
                paid  = float(row["paid_policy_count"])

                # 3-key
                k3 = (pg, pb, lb)
                if k3 not in three_key:
                    three_key[k3] = {"total": 0.0, "paid": 0.0}
                    raw_counts[k3] = 0
                three_key[k3]["total"] += total * w
                three_key[k3]["paid"]  += paid  * w
                raw_counts[k3]         += int(total)

                # 2-key
                k2 = (pg, lb)
                if k2 not in two_key:
                    two_key[k2] = {"total": 0.0, "paid": 0.0}
                two_key[k2]["total"] += total * w
                two_key[k2]["paid"]  += paid  * w

                # pg
                if pg not in pg_acc:
                    pg_acc[pg] = {"total": 0.0, "paid": 0.0}
                pg_acc[pg]["total"] += total * w
                pg_acc[pg]["paid"]  += paid  * w

        # Plain weighted rates for 2-key and pg
        two_key_rates: Dict[Tuple[str, str], float] = {
            k: (acc["paid"] / acc["total"] * 100) if acc["total"] > 0 else 0.0
            for k, acc in two_key.items()
        }
        pg_rates: Dict[str, float] = {
            pg: (acc["paid"] / acc["total"] * 100) if acc["total"] > 0 else 0.0
            for pg, acc in pg_acc.items()
        }

        # 3-key rates with Bayesian shrinkage toward the pg prior
        three_key_rates: Dict[Tuple[str, str, str], float] = {}
        for k3, acc in three_key.items():
            pg    = k3[0]
            pg_a  = pg_acc.get(pg, {"total": 0.0, "paid": 0.0})
            three_key_rates[k3] = self._shrink_toward_prior(
                band_paid=acc["paid"],
                band_total=acc["total"],
                prior_paid=pg_a["paid"],
                prior_total=pg_a["total"],
            )

        return three_key_rates, two_key_rates, pg_rates, raw_counts

    # -------------------------------------------------------------------------
    # Internal: Bayesian shrinkage
    # -------------------------------------------------------------------------

    def _shrink_toward_prior(
        self,
        band_paid: float,
        band_total: float,
        prior_paid: float,
        prior_total: float,
    ) -> float:
        """
        Shrink band-level rate toward the product-group prior.

            credibility = band_total / (band_total + CREDIBILITY_N)
            shrunk = credibility * band_rate + (1 - credibility) * prior_rate

        Returns a percentage (0–100).
        """
        if band_total <= 0:
            return (prior_paid / prior_total * 100) if prior_total > 0 else 0.0

        band_rate  = band_paid / band_total
        prior_rate = (prior_paid / prior_total) if prior_total > 0 else band_rate

        credibility = band_total / (band_total + self.CREDIBILITY_N)
        return (credibility * band_rate + (1 - credibility) * prior_rate) * 100

    # -------------------------------------------------------------------------
    # Internal: band-level forecast
    # -------------------------------------------------------------------------

    def _generate_band_forecast(
        self,
        target_data: List[Dict],
        rolling_averages: Dict[Tuple[str, str, str], float],   # 3-key, shrunk
        two_key_averages: Dict[Tuple[str, str], float],        # 2-key fallback
        pg_averages: Dict[str, float],                         # pg fallback
        sample_counts: Dict[Tuple[str, str, str], int],        # raw N
        ticket_sizes: Dict[str, float],
    ) -> List[BandLevelForecast]:
        """
        Apply rates to target-month exposure using the fallback hierarchy:
          1. (pg, policy_aging_band, lapse_aging_band) — Bayesian-shrunk
          2. (pg, lapse_aging_band)                    — 2-key fallback
          3. pg                                         — broad fallback
          4. 0.0                                        — no history
        """
        forecast: List[BandLevelForecast] = []

        for row in target_data:
            pg = row["product_group"]
            pb = row["policy_aging_band"]
            lb = row["lapse_aging_band"]

            k3 = (pg, pb, lb)
            k2 = (pg, lb)

            if k3 in rolling_averages:
                avg_paid_pct = rolling_averages[k3]
                rate_source  = "band_3key"
            elif k2 in two_key_averages:
                avg_paid_pct = two_key_averages[k2]
                rate_source  = "band_2key"
            elif pg in pg_averages:
                avg_paid_pct = pg_averages[pg]
                rate_source  = "product_group"
            else:
                avg_paid_pct = 0.0
                rate_source  = "none"

            target_count     = row["target_policy_count"]
            forecast_paid    = target_count * avg_paid_pct / 100
            ticket           = ticket_sizes.get(pg, 0.0)
            forecast_amount  = forecast_paid * ticket

            raw_n     = sample_counts.get(k3, 0)
            low_conf  = raw_n < self.MIN_RELIABLE_N

            if low_conf:
                logger.debug(
                    "Low-confidence cell %s (n=%d) — rate from '%s'",
                    k3, raw_n, rate_source,
                )

            forecast.append(
                BandLevelForecast(
                    product_group=pg,
                    policy_aging_band=pb,
                    lapse_aging_band=lb,
                    avg_paid_percentage=round(avg_paid_pct, 2),
                    target_policy_count=target_count,
                    forecast_paid_count=round(forecast_paid, 2),
                    forecast_collected_amount=round(forecast_amount, 2),
                    # rate_source=rate_source,   # surface if schema supports it
                    # sample_n=raw_n,
                    # low_confidence=low_conf,
                )
            )

        return forecast

    # -------------------------------------------------------------------------
    # Internal: product-group summary
    # -------------------------------------------------------------------------

    def _summarize_by_product_group(
        self,
        band_level_forecast: List[BandLevelForecast],
    ) -> List[ProductGroupSummary]:
        """Aggregate band-level forecasts into product-group summaries."""

        pg_buckets: Dict[str, Dict] = {}

        for f in band_level_forecast:
            pg = f.product_group
            if pg not in pg_buckets:
                pg_buckets[pg] = {
                    "total_target": 0,
                    "total_forecast_paid": 0.0,
                    "total_forecast_amount": 0.0,
                }
            pg_buckets[pg]["total_target"]         += f.target_policy_count
            pg_buckets[pg]["total_forecast_paid"]  += f.forecast_paid_count
            pg_buckets[pg]["total_forecast_amount"] += (
                f.forecast_collected_amount or 0.0
            )

        summaries: List[ProductGroupSummary] = []
        for pg, data in pg_buckets.items():
            total   = data["total_target"]
            paid    = data["total_forecast_paid"]
            amount  = data["total_forecast_amount"]
            w_pct   = (paid / total * 100) if total > 0 else 0.0

            summaries.append(
                ProductGroupSummary(
                    product_group=pg,
                    avg_paid_percentage=round(w_pct, 2),
                    target_policy_count=total,
                    forecast_paid_count=round(paid, 2),
                    forecast_collected_amount=round(amount, 2),
                )
            )

        summaries.sort(key=lambda x: x.product_group)
        return summaries