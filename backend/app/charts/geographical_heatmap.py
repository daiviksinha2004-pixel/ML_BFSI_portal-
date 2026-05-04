"""
Geographical Heatmap — chart builder functions.

Chart: State-wise Payment Distribution
Groups policies by state and pmt_flag to show payment behavior across geographies.
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
    propensity: Optional[str] = None,
):
    """Apply the optional dimension filters to any query."""
    if dataset_month:
        q = q.filter(LifeCampaignRecord.dataset_month == dataset_month)
    if product_type:
        q = q.filter(LifeCampaignRecord.product_type == product_type)
    if product_group:
        q = q.filter(LifeCampaignRecord.productgroup == product_group)
    if state:
        q = q.filter(LifeCampaignRecord.state == state)
    if propensity:
        q = q.filter(LifeCampaignRecord.propensity == propensity)
    return q


def build_geographical_heatmap_chart(
    db: Session,
    tenant_id,
    dataset_month: Optional[date] = None,
    product_type: Optional[str] = None,
    product_group: Optional[str] = None,
    state: Optional[str] = None,
    propensity: Optional[str] = None,
    **kwargs
) -> list[dict]:
    """
    Geographical Heatmap by State.
    
    Groups policies by state and pmt_flag to show:
    - Total policy count per state
    - Paid count (pmt_flag = True) per state
    - Unpaid count (pmt_flag = False) per state
    - Payment rate percentage per state
    """
    q = db.query(
        LifeCampaignRecord.state.label("state"),
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
        LifeCampaignRecord.state.isnot(None),
        LifeCampaignRecord.state != "",
    )
    
    q = _apply_filters(q, dataset_month, product_type, product_group, state, propensity)
    
    rows = (
        q.group_by(LifeCampaignRecord.state)
        .order_by(func.count(LifeCampaignRecord.id).desc())
        .all()
    )

    series = []
    for state, total, paid, unpaid in rows:
        total = int(total or 0)
        paid = int(paid or 0)
        unpaid = int(unpaid or 0)
        series.append({
            "state": state,
            "total_count": total,
            "paid_count": paid,
            "unpaid_count": unpaid,
            "payment_rate_pct": round((paid / total) * 100, 1) if total else 0.0,
        })

    return series
