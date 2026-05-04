"""
Policy Status by PMT Flag — chart builder functions.

Chart: Policy Status Distribution by Payment Flag
Groups policies by policy_status and pmt_flag to show payment behavior across status categories.
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


def build_policy_status_by_pmt_flag_chart(
    db: Session,
    tenant_id,
    dataset_month: Optional[date] = None,
    product_type: Optional[str] = None,
    product_group: Optional[str] = None,
    state: Optional[str] = None,
) -> list[dict]:
    """
    Policy Status Distribution by PMT Flag.
    
    Groups policies by policy_status and pmt_flag to show:
    - Total policy count per status
    - Paid count (pmt_flag = True) per status
    - Unpaid count (pmt_flag = False) per status
    - Payment rate percentage per status
    """
    q = db.query(
        LifeCampaignRecord.policy_status.label("policy_status"),
        func.count(LifeCampaignRecord.id).label("total_count"),
        func.sum(
            case(
                (LifeCampaignRecord.pmt_flag.is_(True), 1),
                else_=0
            )
        ).label("paid_count"),
        func.sum(
            case(
                (LifeCampaignRecord.pmt_flag.is_(False), 1),
                else_=0
            )
        ).label("unpaid_count"),
    ).filter(
        LifeCampaignRecord.tenant_id == tenant_id,
        LifeCampaignRecord.policy_status.isnot(None),
        LifeCampaignRecord.policy_status != "",
    )
    
    q = _apply_filters(q, dataset_month, product_type, product_group, state)
    
    rows = (
        q.group_by(LifeCampaignRecord.policy_status)
        .order_by(func.count(LifeCampaignRecord.id).desc())
        .all()
    )

    series = []
    for policy_status, total, paid, unpaid in rows:
        total = int(total or 0)
        paid = int(paid or 0)
        unpaid = int(unpaid or 0)
        series.append({
            "policy_status": policy_status,
            "total_count": total,
            "paid_count": paid,
            "unpaid_count": unpaid,
            "payment_rate_pct": round((paid / total) * 100, 1) if total else 0.0,
        })

    return series
