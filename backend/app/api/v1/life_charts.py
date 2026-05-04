from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_db
from app.charts.payment_rate_by_propensity import (
    build_payment_rate_by_propensity_segment_chart,
)
from app.charts.payment_rate_by_top_channels import (
    build_payment_rate_by_top_channels_chart,
)
from app.charts.payment_rate_by_zone import (
    build_payment_rate_by_zone_chart,
)
from app.charts.outstanding_vs_actual_premium_by_band import (
    build_outstanding_vs_actual_premium_by_band_chart,
)
from app.charts.policy_status_distribution import (
    build_policy_status_distribution_chart,
)
from app.models.platform import User

router = APIRouter()


@router.get("/payment-rate-by-propensity")
def get_payment_rate_by_propensity(
    dataset_month: Optional[date] = Query(
        None,
        description="Filter the chart by a specific dataset month.",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    series = build_payment_rate_by_propensity_segment_chart(
        db=db,
        tenant_id=current_user.tenant_id,
        dataset_month=dataset_month,
    )

    return {
        "chart_key": "payment_rate_by_propensity_segment",
        "dataset_month": dataset_month,
        "series": series,
    }


@router.get("/payment-rate-by-top-channels")
def get_payment_rate_by_top_channels(
    dataset_month: Optional[date] = Query(
        None,
        description="Filter the chart by a specific dataset month.",
    ),
    limit: int = Query(
        6,
        ge=1,
        le=20,
        description="Maximum number of top channels to include.",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    series = build_payment_rate_by_top_channels_chart(
        db=db,
        tenant_id=current_user.tenant_id,
        dataset_month=dataset_month,
        limit=limit,
    )

    return {
        "chart_key": "payment_rate_by_top_channels",
        "dataset_month": dataset_month,
        "limit": limit,
        "series": series,
    }


@router.get("/payment-rate-by-zone")
def get_payment_rate_by_zone(
    dataset_month: Optional[date] = Query(
        None,
        description="Filter the chart by a specific dataset month.",
    ),
    limit: int = Query(
        8,
        ge=1,
        le=20,
        description="Maximum number of zones to include.",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    series = build_payment_rate_by_zone_chart(
        db=db,
        tenant_id=current_user.tenant_id,
        dataset_month=dataset_month,
        limit=limit,
    )

    return {
        "chart_key": "payment_rate_by_zone",
        "dataset_month": dataset_month,
        "limit": limit,
        "series": series,
    }


@router.get("/outstanding-vs-actual-premium-by-band")
def get_outstanding_vs_actual_premium_by_band(
    dataset_month: Optional[date] = Query(
        None,
        description="Filter the chart by a specific dataset month.",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    series = build_outstanding_vs_actual_premium_by_band_chart(
        db=db,
        tenant_id=current_user.tenant_id,
        dataset_month=dataset_month,
    )

    return {
        "chart_key": "outstanding_vs_actual_premium_by_band",
        "dataset_month": dataset_month,
        "series": series,
    }


@router.get("/policy-status-distribution")
def get_policy_status_distribution(
    dataset_month: Optional[date] = Query(
        None,
        description="Filter the chart by a specific dataset month.",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    series = build_policy_status_distribution_chart(
        db=db,
        tenant_id=current_user.tenant_id,
        dataset_month=dataset_month,
    )

    return {
        "chart_key": "policy_status_distribution",
        "dataset_month": dataset_month,
        "series": series,
    }
