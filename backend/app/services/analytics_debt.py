from sqlalchemy.orm import Session
from sqlalchemy import func, case
from datetime import date
from typing import Optional
from app.models.collections import CollectionRecord

def calculate_debt_kpis(db: Session, dataset_month: Optional[date], tenant_id):
    """Calculates all KPIs and Chart data for the Debt Collection Dashboard.
    Optimized to use a single aggregated query instead of N+1 queries."""
    
    # Single aggregated query for KPIs
    aggregated = db.query(
        func.count().label('total_loans'),
        func.sum(CollectionRecord.total_pos).label('total_pos'),
    ).filter(CollectionRecord.tenant_id == tenant_id)
    
    if dataset_month:
        aggregated = aggregated.filter(CollectionRecord.dataset_month == dataset_month)
    
    kpi_result = aggregated.first()
    total_loans = kpi_result.total_loans or 0
    total_pos = kpi_result.total_pos or 0.0
    
    # Separate query for bucket distribution (GROUP BY cannot be combined with simple aggregates)
    bucket_query = db.query(
        CollectionRecord.bucket,
        func.count(CollectionRecord.id).label('count')
    ).filter(CollectionRecord.tenant_id == tenant_id)
    
    if dataset_month:
        bucket_query = bucket_query.filter(CollectionRecord.dataset_month == dataset_month)
    
    bucket_result = bucket_query.group_by(CollectionRecord.bucket).all()

    return {
        "kpis": {
            "total_loans": total_loans,
            "total_principal_outstanding": round(total_pos, 2)
        },
        "charts": {
            "bucket_distribution": [{"name": r[0] or "Unassigned", "value": r[1]} for r in bucket_result]
        }
    }