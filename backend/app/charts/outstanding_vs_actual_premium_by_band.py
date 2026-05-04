from datetime import date
from typing import Optional

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.models.insurance import LifeCampaignRecord


def build_outstanding_vs_actual_premium_by_band_chart(
    db: Session,
    tenant_id,
    dataset_month: Optional[date] = None,
) -> list[dict]:
    outstanding_expr = func.coalesce(LifeCampaignRecord.outstanding_premium, 0)
    actual_expr = func.coalesce(LifeCampaignRecord.act_premium, 0)
    annual_expr = func.coalesce(LifeCampaignRecord.annual_premium, 0)

    band_label = case(
        (annual_expr < 10000, "0-10k"),
        (annual_expr < 25000, "10k-25k"),
        (annual_expr < 50000, "25k-50k"),
        (annual_expr < 100000, "50k-100k"),
        (annual_expr < 250000, "100k-250k"),
        else_="250k+",
    )

    band_order = case(
        (annual_expr < 10000, 0),
        (annual_expr < 25000, 1),
        (annual_expr < 50000, 2),
        (annual_expr < 100000, 3),
        (annual_expr < 250000, 4),
        else_=5,
    )

    query = db.query(
        band_label.label("premium_band"),
        band_order.label("band_order"),
        func.count(LifeCampaignRecord.id).label("policy_count"),
        func.sum(outstanding_expr).label("outstanding_premium_total"),
        func.sum(actual_expr).label("actual_premium_total"),
        func.sum(annual_expr).label("combined_premium_total"),
    ).filter(LifeCampaignRecord.tenant_id == tenant_id)

    if dataset_month:
        query = query.filter(LifeCampaignRecord.dataset_month == dataset_month)

    rows = (
        query.group_by(band_label, band_order)
        .order_by(band_order.asc())
        .all()
    )

    series = []
    for row in rows:
        series.append(
            {
                "premium_band": row.premium_band,
                "policy_count": int(row.policy_count or 0),
                "outstanding_premium_total": float(row.outstanding_premium_total or 0.0),
                "actual_premium_total": float(row.actual_premium_total or 0.0),
                "combined_premium_total": float(row.combined_premium_total or 0.0),
            }
        )

    return series
