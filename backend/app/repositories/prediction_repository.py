"""
Repository layer for lapse prediction and KPI forecasting.
Handles all database queries using SQLAlchemy.
"""
from typing import List, Dict, Tuple, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, case, and_, or_
from datetime import datetime

from app.models.insurance import LifeCampaignRecord
from app.utils.date_utils import calculate_days_between
from app.utils.bucket_utils import get_policy_aging_band, get_lapse_aging_band


class PredictionRepository:
    """Repository for lapse prediction queries."""
    
    def __init__(self, db: Session, tenant_id: str):
        self.db = db
        self.tenant_id = tenant_id
    
    def get_monthly_aggregated_data(
        self,
        month: str,
        product_groups: Optional[List[str]] = None,
        as_of_date: Optional[datetime] = None
    ) -> List[Dict]:
        """
        Get aggregated data for a specific month grouped by:
        - product_group
        - policy_aging_band
        - lapse_aging_band
        
        Returns:
            List of dictionaries with aggregated metrics
        """
        # Rollback any existing transaction to avoid InFailedSqlTransaction error
        try:
            self.db.rollback()
        except:
            pass
        
        # Parse month to get first day
        month_date = datetime.strptime(month, "%Y-%m")
        
        # Build base query - select individual rows for bucketing
        query = self.db.query(
            LifeCampaignRecord.productgroup,
            LifeCampaignRecord.policy_issue_date,
            LifeCampaignRecord.paid_to_date,
            LifeCampaignRecord.pmt_flag
        ).filter(
            LifeCampaignRecord.tenant_id == self.tenant_id,
            func.date_trunc('month', LifeCampaignRecord.dataset_month) == month_date,
            LifeCampaignRecord.policy_issue_date.isnot(None),
            LifeCampaignRecord.paid_to_date.isnot(None)
        )
        
        # Filter by product groups if provided
        if product_groups:
            query = query.filter(LifeCampaignRecord.productgroup.in_(product_groups))
        
        # Execute query
        results = query.all()
        
        # Group by (product_group, policy_aging_band, lapse_aging_band) and aggregate
        grouped_data = {}
        for row in results:
            # Calculate aging days
            policy_aging_days = calculate_days_between(row.policy_issue_date, row.paid_to_date)
            lapse_aging_days = calculate_days_between(row.paid_to_date, as_of_date) if as_of_date else 0
            
            # Get bucket bands
            policy_band = get_policy_aging_band(policy_aging_days)
            lapse_band = get_lapse_aging_band(lapse_aging_days)
            
            key = (row.productgroup or 'Unknown', policy_band, lapse_band)
            if key not in grouped_data:
                grouped_data[key] = {'total': 0, 'paid': 0}
            grouped_data[key]['total'] += 1
            if row.pmt_flag:
                grouped_data[key]['paid'] += 1
        
        # Convert to aggregated_data format
        aggregated_data = []
        for (product_group, policy_band, lapse_band), counts in grouped_data.items():
            total = counts['total']
            paid = counts['paid']
            paid_percentage = (paid / total * 100) if total > 0 else 0.0
            
            aggregated_data.append({
                'product_group': product_group,
                'policy_aging_band': policy_band,
                'lapse_aging_band': lapse_band,
                'total_policy_count': total,
                'paid_policy_count': paid,
                'paid_percentage': paid_percentage
            })
        
        return aggregated_data
    
    def get_target_month_data(
        self,
        target_month: str,
        product_groups: Optional[List[str]] = None,
        as_of_date: Optional[datetime] = None
    ) -> List[Dict]:
        """
        Get target month data grouped by:
        - product_group
        - policy_aging_band
        - lapse_aging_band
        
        Returns:
            List of dictionaries with target policy counts
        """
        # Rollback any existing transaction to avoid InFailedSqlTransaction error
        try:
            self.db.rollback()
        except:
            pass
        
        # Parse month to get first day
        month_date = datetime.strptime(target_month, "%Y-%m")
        
        # Build base query - select individual rows for bucketing
        query = self.db.query(
            LifeCampaignRecord.productgroup,
            LifeCampaignRecord.policy_issue_date,
            LifeCampaignRecord.paid_to_date
        ).filter(
            LifeCampaignRecord.tenant_id == self.tenant_id,
            func.date_trunc('month', LifeCampaignRecord.dataset_month) == month_date,
            LifeCampaignRecord.policy_issue_date.isnot(None),
            LifeCampaignRecord.paid_to_date.isnot(None)
        )
        
        # Filter by product groups if provided
        if product_groups:
            query = query.filter(LifeCampaignRecord.productgroup.in_(product_groups))
        
        # Execute query
        results = query.all()
        
        # Group by (product_group, policy_aging_band, lapse_aging_band) and count
        grouped_data = {}
        for row in results:
            # Calculate aging days
            policy_aging_days = calculate_days_between(row.policy_issue_date, row.paid_to_date)
            lapse_aging_days = calculate_days_between(row.paid_to_date, as_of_date) if as_of_date else 0
            
            # Get bucket bands
            policy_band = get_policy_aging_band(policy_aging_days)
            lapse_band = get_lapse_aging_band(lapse_aging_days)
            
            key = (row.productgroup or 'Unknown', policy_band, lapse_band)
            if key not in grouped_data:
                grouped_data[key] = 0
            grouped_data[key] += 1
        
        # Convert to target_data format
        target_data = []
        for (product_group, policy_band, lapse_band), count in grouped_data.items():
            target_data.append({
                'product_group': product_group,
                'policy_aging_band': policy_band,
                'lapse_aging_band': lapse_band,
                'target_policy_count': count
            })
        
        return target_data
    
    def get_avg_ticket_size_by_product_group(
        self,
        months: List[str],
        product_groups: Optional[List[str]] = None
    ) -> Dict[str, float]:
        """
        Calculate average ticket size (premium per policy) per product group across given months.
        
        Args:
            months: List of month strings in format "YYYY-MM"
            product_groups: Optional list of product groups to filter
        
        Returns:
            Dict mapping product_group to average ticket size (float)
        """
        if not months:
            return {}
        
        # Parse months to date objects
        month_dates = [datetime.strptime(m, "%Y-%m") for m in months]
        
        # Build query grouped by productgroup
        query = self.db.query(
            LifeCampaignRecord.productgroup,
            func.sum(LifeCampaignRecord.act_premium).label('total_premium'),
            func.count(LifeCampaignRecord.id).label('total_policies')
        ).filter(
            LifeCampaignRecord.tenant_id == self.tenant_id,
            func.date_trunc('month', LifeCampaignRecord.dataset_month).in_(month_dates),
            LifeCampaignRecord.act_premium.isnot(None)
        ).group_by(LifeCampaignRecord.productgroup)
        
        # Filter by product groups if provided
        if product_groups:
            query = query.filter(LifeCampaignRecord.productgroup.in_(product_groups))
        
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
    
    def get_distinct_product_groups(self) -> List[str]:
        """
        Get all distinct product groups for the tenant.
        
        Returns:
            List of product group names
        """
        results = self.db.query(LifeCampaignRecord.productgroup).filter(
            LifeCampaignRecord.tenant_id == self.tenant_id,
            LifeCampaignRecord.productgroup.isnot(None),
            LifeCampaignRecord.productgroup != ""
        ).distinct().all()
        
        return [row[0] for row in results if row[0]]
