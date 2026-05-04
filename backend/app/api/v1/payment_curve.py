"""
API endpoints for Payment Curve Analysis.

Prefix: /api/v1/payment-curve

All chart endpoints accept the same optional filter query params:
    dataset_month  — YYYY-MM-DD
    product_type   — e.g. "Traditional", "ULIP"
    product_group  — e.g. "PAR", "NONPAR"
    state          — e.g. "MAHARASHTRA"
"""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db
from app.charts.payment_curve_by_lapse_aging import (
    build_payment_rate_by_lapse_aging_chart,
    build_policy_count_by_pmt_flag_chart,
    build_payment_rate_trend_chart,
    build_lapse_aging_distribution_chart,
    build_policy_count_by_policy_aging_chart,
    get_filter_options,
)
from app.charts.payment_curve_by_propensity import (
    build_payment_curve_by_propensity_chart,
)
from app.charts.policy_status_by_pmt_flag import (
    build_policy_status_by_pmt_flag_chart,
)
from app.charts.geographical_heatmap import (
    build_geographical_heatmap_chart,
)
from app.models.platform import User

router = APIRouter()


# ── Shared filter query params ───────────────────────────────────
def _filter_params(
    dataset_month: Optional[date] = Query(None, description="Filter by dataset month (YYYY-MM-DD)."),
    product_type:  Optional[str]  = Query(None, description="Filter by product type."),
    product_group: Optional[str]  = Query(None, description="Filter by product group."),
    state:         Optional[str]  = Query(None, description="Filter by state."),
):
    return {
        "dataset_month": dataset_month,
        "product_type":  product_type,
        "product_group": product_group,
        "state":         state,
    }


# ── /filters  — returns distinct dimension values ────────────────
@router.get("/filters")
def get_payment_curve_filters(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returns distinct filter options for product_type, productgroup and state."""
    return get_filter_options(db=db, tenant_id=current_user.tenant_id)


# ── /payment-rate-by-lapse-aging ────────────────────────────────
@router.get("/payment-rate-by-lapse-aging")
def get_payment_rate_by_lapse_aging(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    filters: dict = Depends(_filter_params),
):
    series = build_payment_rate_by_lapse_aging_chart(
        db=db, tenant_id=current_user.tenant_id, **filters
    )
    return {"chart_key": "payment_rate_by_lapse_aging", **filters, "series": series}


# ── /policy-count-by-pmt-flag ───────────────────────────────────
@router.get("/policy-count-by-pmt-flag")
def get_policy_count_by_pmt_flag(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    filters: dict = Depends(_filter_params),
):
    series = build_policy_count_by_pmt_flag_chart(
        db=db, tenant_id=current_user.tenant_id, **filters
    )
    return {"chart_key": "policy_count_by_pmt_flag", **filters, "series": series}


# ── /payment-rate-trend ─────────────────────────────────────────
@router.get("/payment-rate-trend")
def get_payment_rate_trend(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    product_type:  Optional[str] = Query(None),
    product_group: Optional[str] = Query(None),
    state:         Optional[str] = Query(None),
):
    """Trend spans all months; only dimension filters apply."""
    series = build_payment_rate_trend_chart(
        db=db,
        tenant_id=current_user.tenant_id,
        product_type=product_type,
        product_group=product_group,
        state=state,
    )
    return {"chart_key": "payment_rate_trend", "series": series}


# ── /lapse-aging-distribution ───────────────────────────────────
@router.get("/lapse-aging-distribution")
def get_lapse_aging_distribution(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    filters: dict = Depends(_filter_params),
):
    data = build_lapse_aging_distribution_chart(
        db=db, tenant_id=current_user.tenant_id, **filters
    )
    return {"chart_key": "lapse_aging_distribution", **filters, **data}


# ── /policy-count-by-policy-aging ───────────────────────────────
@router.get("/policy-count-by-policy-aging")
def get_policy_count_by_policy_aging(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    filters: dict = Depends(_filter_params),
):
    series = build_policy_count_by_policy_aging_chart(
        db=db, tenant_id=current_user.tenant_id, **filters
    )
    return {"chart_key": "policy_count_by_policy_aging", **filters, "series": series}


# ── /payment-curve-by-propensity ───────────────────────────────
@router.get("/payment-curve-by-propensity")
def get_payment_curve_by_propensity(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    filters: dict = Depends(_filter_params),
):
    series = build_payment_curve_by_propensity_chart(
        db=db, tenant_id=current_user.tenant_id, **filters
    )
    return {"chart_key": "payment_curve_by_propensity", **filters, "series": series}


# ── /policy-status-by-pmt-flag ───────────────────────────────
@router.get("/policy-status-by-pmt-flag")
def get_policy_status_by_pmt_flag(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    filters: dict = Depends(_filter_params),
):
    series = build_policy_status_by_pmt_flag_chart(
        db=db, tenant_id=current_user.tenant_id, **filters
    )
    return {"chart_key": "policy_status_by_pmt_flag", **filters, "series": series}


# ── /geographical-heatmap ───────────────────────────────
@router.get("/geographical-heatmap")
def get_geographical_heatmap(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    filters: dict = Depends(_filter_params),
    propensity: Optional[str] = Query(None, description="Filter by propensity"),
):
    filters_copy = dict(filters)
    filters_copy["propensity"] = propensity
    series = build_geographical_heatmap_chart(
        db=db, tenant_id=current_user.tenant_id, **filters_copy
    )
    return {"chart_key": "geographical_heatmap", **filters_copy, "series": series}
