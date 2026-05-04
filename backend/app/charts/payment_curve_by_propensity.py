"""
Payment Curve Analysis by Propensity — chart builder functions.

Chart: Payment Rate by Propensity Segment
Groups policies by propensity and calculates payment rate (pmt_flag / total_count).
"""

from datetime import date
from typing import Optional

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.models.insurance import LifeCampaignRecord


def _apply_filters(
    q,
    dataset_month: Optional[date] = None,
    product_type: Optional[str] = None,
    product_group: Optional[str] = None,
    state: Optional[str] = None,
):
    """Apply the four optional dimension filters to any query."""
    if dataset_month:
        q = q.filter(LifeCampaignRecord.dataset_month == dataset_month)
    if product_type:
        q = q.filter(LifeCampaignRecord.product_type == product_type)
    if product_group:
        q = q.filter(LifeCampaignRecord.productgroup == product_group)
    if state:
        q = q.filter(LifeCampaignRecord.state == state)
    return q


def build_payment_curve_by_propensity_chart(
    db: Session,
    tenant_id,
    dataset_month: Optional[date] = None,
    product_type: Optional[str] = None,
    product_group: Optional[str] = None,
    state: Optional[str] = None,
) -> list[dict]:
    """
    Payment Curve by Propensity Segment.
    
    Groups policies by propensity and calculates:
    - Total policy count
    - Paid count (pmt_flag = True)
    - Unpaid count (pmt_flag = False)
    - Payment rate percentage (paid / total * 100)
    """
    paid_count_expr = func.sum(
        case((LifeCampaignRecord.pmt_flag.is_(True), 1), else_=0)
    )
    unpaid_count_expr = func.sum(
        case((LifeCampaignRecord.pmt_flag.is_(False), 1), else_=0)
    )
    
    q = db.query(
        LifeCampaignRecord.propensity.label("propensity"),
        func.count(LifeCampaignRecord.id).label("total_count"),
        paid_count_expr.label("paid_count"),
        unpaid_count_expr.label("unpaid_count"),
    ).filter(
        LifeCampaignRecord.tenant_id == tenant_id,
        LifeCampaignRecord.propensity.isnot(None),
        LifeCampaignRecord.propensity != "",
    )
    
    q = _apply_filters(q, dataset_month, product_type, product_group, state)
    
    rows = (
        q.group_by(LifeCampaignRecord.propensity)
        .order_by(LifeCampaignRecord.propensity)
        .all()
    )

    series = []
    for propensity, total, paid, unpaid in rows:
        total = int(total or 0)
        paid = int(paid or 0)
        unpaid = int(unpaid or 0)
        series.append({
            "propensity": propensity,
            "total_count": total,
            "paid_count": paid,
            "unpaid_count": unpaid,
            "payment_rate_pct": round((paid / total) * 100, 1) if total else 0.0,
        })

    return series
