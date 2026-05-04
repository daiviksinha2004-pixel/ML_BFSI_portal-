from datetime import date
from typing import Optional

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.models.insurance import LifeCampaignRecord


def build_payment_rate_by_zone_chart(
    db: Session,
    tenant_id,
    dataset_month: Optional[date] = None,
    limit: int = 8,
) -> list[dict]:
    normalized_zone = func.trim(func.coalesce(LifeCampaignRecord.zone, ""))
    paid_count_expr = func.sum(
        case(
            (LifeCampaignRecord.pmt_flag.is_(True), 1),
            else_=0,
        )
    )

    query = db.query(
        normalized_zone.label("zone"),
        func.count(LifeCampaignRecord.id).label("total_count"),
        paid_count_expr.label("paid_count"),
    ).filter(LifeCampaignRecord.tenant_id == tenant_id)

    if dataset_month:
        query = query.filter(LifeCampaignRecord.dataset_month == dataset_month)

    rows = (
        query.group_by(normalized_zone)
        .order_by(func.count(LifeCampaignRecord.id).desc(), normalized_zone.asc())
        .limit(limit)
        .all()
    )

    series = []
    for row in rows:
        zone = (row.zone or "").strip() or "Unassigned"
        total_count = int(row.total_count or 0)
        paid_count = int(row.paid_count or 0)
        unpaid_count = max(total_count - paid_count, 0)
        payment_rate_pct = round((paid_count / total_count) * 100, 1) if total_count else 0.0

        series.append(
            {
                "zone": zone,
                "payment_rate_pct": payment_rate_pct,
                "paid_count": paid_count,
                "unpaid_count": unpaid_count,
                "total_count": total_count,
            }
        )

    return series
