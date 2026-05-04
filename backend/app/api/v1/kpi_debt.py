from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date
from typing import Optional

from app.api.dependencies import get_db, get_current_user
from app.models.platform import User
from app.models.collections import CollectionRecord

router = APIRouter()


@router.get("/months")
def get_available_months(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Returns sorted list of distinct dataset_months available for this tenant."""
    rows = (
        db.query(CollectionRecord.dataset_month)
        .filter(CollectionRecord.tenant_id == current_user.tenant_id)
        .distinct()
        .order_by(CollectionRecord.dataset_month)
        .all()
    )
    return [{"value": str(r[0]), "label": r[0].strftime("%b %Y")} for r in rows if r[0]]


@router.get("/")
def get_debt_kpis(
    dataset_month: Optional[date] = Query(None, description="Filter metrics by a specific month"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Dedicated analytics engine returning KPIs for the Debt Collection Dashboard.
    Optimized to use a single aggregated query instead of N+1 queries.
    """
    # Single aggregated query for KPIs
    aggregated = db.query(
        func.count().label('total_records'),
        func.sum(CollectionRecord.total_pos).label('total_outstanding'),
        func.sum(CollectionRecord.outstanding_premium).label('total_outstanding_premium'),
    ).filter(CollectionRecord.tenant_id == current_user.tenant_id)
    
    if dataset_month:
        aggregated = aggregated.filter(CollectionRecord.dataset_month == dataset_month)
    
    result = aggregated.first()
    
    # Extract values with defaults
    total_records = result.total_records or 1  # prevent div by zero
    total_outstanding_val = result.total_outstanding or 0.0
    total_outstanding_premium_val = result.total_outstanding_premium or 0.0
    
    # Calculate derived metrics
    avg_per_loan = round((total_outstanding_val / total_records), 0) if total_records else 0.0
    
    return {
        "header": f"DEBT COLLECTION KPIS — {total_records:,} LOANS",
        "total_loans": {
            "value_raw": total_records,
            "label_primary": f"{total_records:,}",
            "label_subtitle": "Total Active Loans"
        },
        "total_outstanding_portfolio": {
            "value_raw": float(total_outstanding_val),
            "label_primary": f"₹{round(total_outstanding_val / 10000000, 2)}Cr",
            "label_subtitle": f"Avg ₹{int(avg_per_loan):,}/loan"
        },
        "total_outstanding_emi": {
            "value_raw": float(total_outstanding_premium_val),
            "label_primary": f"₹{round(total_outstanding_premium_val / 10000000, 2)}Cr",
            "label_subtitle": "Outstanding EMI Dues"
        }
    }
