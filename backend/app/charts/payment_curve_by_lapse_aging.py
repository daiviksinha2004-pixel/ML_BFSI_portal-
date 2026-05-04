"""
Payment Curve Analysis — chart builder functions.

All public builders accept optional filter kwargs:
    dataset_month  : date   — filter by allocation month
    product_type   : str    — filter by product_type column
    product_group  : str    — filter by productgroup column
    state          : str    — filter by state column
"""

from datetime import date
from typing import Optional

from sqlalchemy import case, func, extract
from sqlalchemy.orm import Session

from app.models.insurance import LifeCampaignRecord


# ── Lapse-aging day-band boundaries ─────────────────────────────
_AGING_BANDS = [
    (0,    30,   "0–30 days"),
    (31,   60,   "31–60 days"),
    (61,   90,   "61–90 days"),
    (91,   180,  "91–180 days"),
    (181,  365,  "181–365 days"),
    (366,  730,  "1–2 years"),
    (731,  1825, "2–5 years"),
    (1826, None, "5+ years"),
]

# ── Policy-aging year-band boundaries ───────────────────────────
_POLICY_AGING_YEAR_BANDS = [
    (0,    365,  "0–1 Year"),
    (366,  730,  "1–2 Years"),
    (731,  1095, "2–3 Years"),
    (1096, 1460, "3–4 Years"),
    (1461, 1825, "4–5 Years"),
    (1826, 2555, "5–7 Years"),
    (2556, 3650, "7–10 Years"),
    (3651, None, "10+ Years"),
]


def _assign_band(days: int) -> str:
    for lo, hi, label in _AGING_BANDS:
        if hi is None and days >= lo:
            return label
        if hi is not None and lo <= days <= hi:
            return label
    return "Unknown"


def _assign_year_band(days: int) -> str:
    for lo, hi, label in _POLICY_AGING_YEAR_BANDS:
        if hi is None and days >= lo:
            return label
        if hi is not None and lo <= days <= hi:
            return label
    return "Unknown"


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


# ──────────────────────────────────────────────────────────────────
# Filter Options endpoint helper
# ──────────────────────────────────────────────────────────────────
def get_filter_options(db: Session, tenant_id) -> dict:
    """
    Returns distinct non-null/non-empty values for the three filter
    dimensions: product_type, productgroup, state.
    """

    def _distinct(col):
        rows = (
            db.query(col)
            .filter(LifeCampaignRecord.tenant_id == tenant_id)
            .filter(col.isnot(None))
            .filter(col != "")
            .filter(col != "-")
            .filter(col != "0")
            .distinct()
            .order_by(col)
            .all()
        )
        return [r[0] for r in rows]

    return {
        "product_types": _distinct(LifeCampaignRecord.product_type),
        "product_groups": _distinct(LifeCampaignRecord.productgroup),
        "states": _distinct(LifeCampaignRecord.state),
    }


# ──────────────────────────────────────────────────────────────────
# Chart 1 — Payment Rate by Lapse Aging Band  (BarChart)
# ──────────────────────────────────────────────────────────────────
def build_payment_rate_by_lapse_aging_chart(
    db: Session,
    tenant_id,
    dataset_month: Optional[date] = None,
    product_type: Optional[str] = None,
    product_group: Optional[str] = None,
    state: Optional[str] = None,
) -> list[dict]:
    """
    Lapse aging = dataset_month − paid_to_date (days), bucketed into bands.
    """
    q = db.query(
        LifeCampaignRecord.dataset_month,
        LifeCampaignRecord.paid_to_date,
        LifeCampaignRecord.pmt_flag,
    ).filter(
        LifeCampaignRecord.tenant_id == tenant_id,
        LifeCampaignRecord.paid_to_date.isnot(None),
    )
    q = _apply_filters(q, dataset_month, product_type, product_group, state)
    rows = q.all()

    buckets: dict[str, dict] = {}
    for dsm, ptd, pmt in rows:
        if dsm is None or ptd is None:
            continue
        days = max((dsm - ptd).days, 0)
        band = _assign_band(days)
        if band not in buckets:
            buckets[band] = {"total": 0, "paid": 0}
        buckets[band]["total"] += 1
        if pmt:
            buckets[band]["paid"] += 1

    series = []
    for idx, (lo, hi, label) in enumerate(_AGING_BANDS):
        if label not in buckets:
            continue
        b = buckets[label]
        total = b["total"]
        paid = b["paid"]
        series.append({
            "aging_band": label,
            "total_count": total,
            "paid_count": paid,
            "unpaid_count": total - paid,
            "payment_rate_pct": round((paid / total) * 100, 1) if total else 0.0,
            "sort_order": idx,
        })

    return sorted(series, key=lambda x: x["sort_order"])


# ──────────────────────────────────────────────────────────────────
# Chart 2 — Policy Count by PMT Flag  (Donut)
# ──────────────────────────────────────────────────────────────────
def build_policy_count_by_pmt_flag_chart(
    db: Session,
    tenant_id,
    dataset_month: Optional[date] = None,
    product_type: Optional[str] = None,
    product_group: Optional[str] = None,
    state: Optional[str] = None,
) -> list[dict]:
    q = db.query(
        LifeCampaignRecord.pmt_flag,
        func.count(LifeCampaignRecord.id).label("cnt"),
    ).filter(LifeCampaignRecord.tenant_id == tenant_id)
    q = _apply_filters(q, dataset_month, product_type, product_group, state)
    rows = q.group_by(LifeCampaignRecord.pmt_flag).all()

    result = [
        {"name": "Paid" if flag else "Unpaid", "value": int(cnt)}
        for flag, cnt in rows
    ]
    return sorted(result, key=lambda x: x["name"] != "Paid")


# ──────────────────────────────────────────────────────────────────
# Chart 3 — Payment Rate Trend  (LineChart)
# ──────────────────────────────────────────────────────────────────
def build_payment_rate_trend_chart(
    db: Session,
    tenant_id,
    product_type: Optional[str] = None,
    product_group: Optional[str] = None,
    state: Optional[str] = None,
) -> list[dict]:
    paid_count_expr = func.sum(
        case((LifeCampaignRecord.pmt_flag.is_(True), 1), else_=0)
    )
    q = db.query(
        LifeCampaignRecord.dataset_month,
        func.count(LifeCampaignRecord.id).label("total_count"),
        paid_count_expr.label("paid_count"),
    ).filter(LifeCampaignRecord.tenant_id == tenant_id)
    # Trend always spans all months; only non-month filters apply here
    q = _apply_filters(q, None, product_type, product_group, state)
    rows = (
        q.group_by(LifeCampaignRecord.dataset_month)
         .order_by(LifeCampaignRecord.dataset_month)
         .all()
    )

    series = []
    for dsm, total, paid in rows:
        total = int(total or 0)
        paid = int(paid or 0)
        series.append({
            "month": dsm.strftime("%b %Y") if dsm else "Unknown",
            "total_count": total,
            "paid_count": paid,
            "unpaid_count": total - paid,
            "payment_rate_pct": round((paid / total) * 100, 1) if total else 0.0,
        })
    return series


# ──────────────────────────────────────────────────────────────────
# Chart 4 — Lapse Aging Distribution  (AreaChart)
# ──────────────────────────────────────────────────────────────────
def build_lapse_aging_distribution_chart(
    db: Session,
    tenant_id,
    dataset_month: Optional[date] = None,
    product_type: Optional[str] = None,
    product_group: Optional[str] = None,
    state: Optional[str] = None,
) -> dict:
    q = db.query(
        LifeCampaignRecord.dataset_month,
        LifeCampaignRecord.paid_to_date,
    ).filter(
        LifeCampaignRecord.tenant_id == tenant_id,
        LifeCampaignRecord.paid_to_date.isnot(None),
    )
    q = _apply_filters(q, dataset_month, product_type, product_group, state)
    rows = q.all()

    all_days = []
    buckets: dict[str, int] = {}
    for dsm, ptd in rows:
        if dsm is None or ptd is None:
            continue
        days = max((dsm - ptd).days, 0)
        all_days.append(days)
        band = _assign_band(days)
        buckets[band] = buckets.get(band, 0) + 1

    distribution = [
        {
            "aging_band": label,
            "policy_count": buckets.get(label, 0),
            "sort_order": idx,
        }
        for idx, (lo, hi, label) in enumerate(_AGING_BANDS)
    ]

    avg_days = round(sum(all_days) / len(all_days), 1) if all_days else 0
    return {
        "summary": {
            "total_policies": len(all_days),
            "avg_lapse_days": avg_days,
            "max_lapse_days": max(all_days) if all_days else 0,
            "min_lapse_days": min(all_days) if all_days else 0,
        },
        "distribution": distribution,
    }


# ──────────────────────────────────────────────────────────────────
# Chart 5 — Policy Count by Policy Aging Year Buckets  (BarChart)
# ──────────────────────────────────────────────────────────────────
def build_policy_count_by_policy_aging_chart(
    db: Session,
    tenant_id,
    dataset_month: Optional[date] = None,
    product_type: Optional[str] = None,
    product_group: Optional[str] = None,
    state: Optional[str] = None,
) -> list[dict]:
    """
    Policy age = dataset_month − policy_issue_date (days), bucketed into year bands.
    """
    q = db.query(
        LifeCampaignRecord.dataset_month,
        LifeCampaignRecord.policy_issue_date,
        LifeCampaignRecord.pmt_flag,
    ).filter(
        LifeCampaignRecord.tenant_id == tenant_id,
        LifeCampaignRecord.policy_issue_date.isnot(None),
    )
    q = _apply_filters(q, dataset_month, product_type, product_group, state)
    rows = q.all()

    buckets: dict[str, dict] = {}
    for dsm, issue_date, pmt in rows:
        if dsm is None or issue_date is None:
            continue
        days = max((dsm - issue_date).days, 0)
        band = _assign_year_band(days)
        if band not in buckets:
            buckets[band] = {"total": 0, "paid": 0}
        buckets[band]["total"] += 1
        if pmt:
            buckets[band]["paid"] += 1

    series = []
    for idx, (lo, hi, label) in enumerate(_POLICY_AGING_YEAR_BANDS):
        if label not in buckets:
            continue
        b = buckets[label]
        total = b["total"]
        paid = b["paid"]
        series.append({
            "aging_band": label,
            "total_count": total,
            "paid_count": paid,
            "unpaid_count": total - paid,
            "payment_rate_pct": round((paid / total) * 100, 1) if total else 0.0,
            "sort_order": idx,
        })

    return sorted(series, key=lambda x: x["sort_order"])
