from datetime import date
from typing import Optional

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.models.insurance import LifeCampaignRecord

_PROPENSITY_ORDER = {
    "A.HIGH": 0,
    "B.MEDIUM": 1,
    "C.LOW": 2,
    "D.VERY LOW": 3,
    "D.VERY_LOW": 3,
}


def _sort_key(propensity: str) -> tuple[int, str]:
    normalized = (propensity or "").strip()
    if normalized == "Unassigned":
        return (999, normalized)
    return (_PROPENSITY_ORDER.get(normalized, 100), normalized)


def build_payment_rate_by_propensity_segment_chart(
    db: Session,
    tenant_id,
    dataset_month: Optional[date] = None,
) -> list[dict]:
    paid_count_expr = func.sum(
        case(
            (LifeCampaignRecord.pmt_flag.is_(True), 1),
            else_=0,
        )
    )

    query = db.query(
        LifeCampaignRecord.propensity.label("propensity"),
        func.count(LifeCampaignRecord.id).label("total_count"),
        paid_count_expr.label("paid_count"),
    ).filter(LifeCampaignRecord.tenant_id == tenant_id)

    if dataset_month:
        query = query.filter(LifeCampaignRecord.dataset_month == dataset_month)

    rows = query.group_by(LifeCampaignRecord.propensity).all()

    series = []
    for row in rows:
        propensity = (row.propensity or "").strip() or "Unassigned"
        total_count = int(row.total_count or 0)
        paid_count = int(row.paid_count or 0)
        unpaid_count = max(total_count - paid_count, 0)
        payment_rate_pct = round((paid_count / total_count) * 100, 1) if total_count else 0.0

        series.append(
            {
                "propensity": propensity,
                "payment_rate_pct": payment_rate_pct,
                "paid_count": paid_count,
                "unpaid_count": unpaid_count,
                "total_count": total_count,
            }
        )

    return sorted(series, key=lambda item: _sort_key(item["propensity"]))
