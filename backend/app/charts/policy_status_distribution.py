from datetime import date
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.insurance import LifeCampaignRecord


def build_policy_status_distribution_chart(
    db: Session,
    tenant_id,
    dataset_month: Optional[date] = None,
) -> list[dict]:
    normalized_status = func.trim(func.coalesce(LifeCampaignRecord.policy_status, ""))

    query = db.query(
        normalized_status.label("policy_status"),
        func.count(LifeCampaignRecord.id).label("total_count"),
    ).filter(LifeCampaignRecord.tenant_id == tenant_id)

    if dataset_month:
        query = query.filter(LifeCampaignRecord.dataset_month == dataset_month)

    rows = query.group_by(normalized_status).all()

    series = []
    for row in rows:
        status = (row.policy_status or "").strip() or "Unassigned"
        total_count = int(row.total_count or 0)
        series.append(
            {
                "policy_status": status,
                "total_count": total_count,
            }
        )

    return sorted(series, key=lambda item: (-item["total_count"], item["policy_status"]))
