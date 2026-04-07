from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date
from typing import Optional
from app.models.insurance import LifeCampaignRecord

def calculate_life_kpis(db: Session, dataset_month: Optional[date]):
    """Calculates all KPIs and Chart data for the Life Insurance Dashboard."""
    
    base_query = db.query(LifeCampaignRecord)
    premium_query = db.query(func.sum(LifeCampaignRecord.outstanding_premium))
    prop_query = db.query(LifeCampaignRecord.propensity_band, func.count(LifeCampaignRecord.id))

    if dataset_month:
        base_query = base_query.filter(LifeCampaignRecord.dataset_month == dataset_month)
        premium_query = premium_query.filter(LifeCampaignRecord.dataset_month == dataset_month)
        prop_query = prop_query.filter(LifeCampaignRecord.dataset_month == dataset_month)

    total_policies = base_query.count()
    total_premium = premium_query.scalar() or 0.0
    prop_query_result = prop_query.group_by(LifeCampaignRecord.propensity_band).all()

    return {
        "kpis": {
            "total_policies": total_policies,
            "total_outstanding_premium": round(total_premium, 2)
        },
        "charts": {
            "propensity_distribution": [{"name": r[0] or "Unknown", "value": r[1]} for r in prop_query_result]
        }
    }