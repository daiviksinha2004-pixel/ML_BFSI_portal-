from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date
from typing import Optional
from app.models.collections import CollectionRecord

def calculate_debt_kpis(db: Session, dataset_month: Optional[date]):
    """Calculates all KPIs and Chart data for the Debt Collection Dashboard."""
    
    base_query = db.query(CollectionRecord)
    pos_query = db.query(func.sum(CollectionRecord.total_pos))
    bucket_query = db.query(CollectionRecord.bucket, func.count(CollectionRecord.id))

    if dataset_month:
        base_query = base_query.filter(CollectionRecord.dataset_month == dataset_month)
        pos_query = pos_query.filter(CollectionRecord.dataset_month == dataset_month)
        bucket_query = bucket_query.filter(CollectionRecord.dataset_month == dataset_month)

    total_loans = base_query.count()
    total_pos = pos_query.scalar() or 0.0
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