from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date
from typing import Optional

from app.api.dependencies import get_db, get_current_user
from app.models.platform import User
from app.models.insurance import LifeCampaignRecord

router = APIRouter()


def _normalized_policy_status():
    return func.lower(
        func.replace(
            func.replace(
                func.trim(func.coalesce(LifeCampaignRecord.policy_status, "")),
                " ",
                "",
            ),
            "-",
            "",
        )
    )

@router.get("/months")
def get_available_months(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Returns sorted list of distinct dataset_months available for this tenant."""
    rows = (
        db.query(LifeCampaignRecord.dataset_month)
        .filter(LifeCampaignRecord.tenant_id == current_user.tenant_id)
        .distinct()
        .order_by(LifeCampaignRecord.dataset_month)
        .all()
    )
    return [{"value": str(r[0]), "label": r[0].strftime("%b %Y")} for r in rows if r[0]]


@router.get("/")
def get_life_kpis(
    dataset_month: Optional[date] = Query(None, description="Filter metrics by a specific month"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Dedicated mathematical analytics engine returning precisely the 8 KPI blocks 
    required for the Life Insurance Core KPIs interface.
    Optimized to use a single aggregated query instead of N+1 queries.
    """
    # Single aggregated query with CASE statements for all KPIs
    from sqlalchemy import case, literal_column
    
    norm_status = _normalized_policy_status()
    
    aggregated = db.query(
        func.count().label('total_records'),
        func.sum(LifeCampaignRecord.outstanding_premium).label('total_outstanding'),
        func.sum(LifeCampaignRecord.act_premium).label('total_actual'),
        func.sum(LifeCampaignRecord.interest_charged).label('total_interest'),
        func.avg(LifeCampaignRecord.lot_date - LifeCampaignRecord.policy_lapse_date).label('avg_lapse'),
        func.max(LifeCampaignRecord.lot_date - LifeCampaignRecord.policy_lapse_date).label('max_lapse'),
        func.avg(LifeCampaignRecord.policy_lapse_date - LifeCampaignRecord.policy_issue_date).label('avg_policy_ageing'),
        func.sum(case((LifeCampaignRecord.propensity == 'A.HIGH', 1), else_=0)).label('high_propensity_count'),
        func.sum(case((LifeCampaignRecord.policy_status == 'Due', 1), else_=0)).label('grace_count'),
        func.sum(case((LifeCampaignRecord.pmt_flag == True, 1), else_=0)).label('pmt_paid_count'),
        func.sum(case((LifeCampaignRecord.pmt_flag == False, 1), else_=0)).label('pmt_unpaid_count'),
        func.sum(case((LifeCampaignRecord.pmt_flag == True, LifeCampaignRecord.act_premium), else_=0)).label('pmt_collected_paid'),
        func.sum(case((LifeCampaignRecord.pmt_flag == True, LifeCampaignRecord.outstanding_premium), else_=0)).label('pmt_out_paid'),
        func.sum(case((LifeCampaignRecord.pmt_flag == False, LifeCampaignRecord.outstanding_premium), else_=0)).label('pmt_out_unpaid'),
    ).filter(LifeCampaignRecord.tenant_id == current_user.tenant_id)
    
    if dataset_month:
        aggregated = aggregated.filter(LifeCampaignRecord.dataset_month == dataset_month)
    
    result = aggregated.first()
    
    # Extract values with defaults
    total_records = result.total_records or 1  # prevent div by zero
    total_outstanding_val = result.total_outstanding or 0.0
    total_actual_val = result.total_actual or 0.0
    total_interest_val = result.total_interest or 0.0
    avg_lapse = round(result.avg_lapse or 0.0, 1)
    max_lapse = result.max_lapse or 0
    avg_policy_ageing = round(result.avg_policy_ageing or 0.0, 0)
    high_propensity_count = result.high_propensity_count or 0
    grace_count = result.grace_count or 0
    pmt_paid_count = result.pmt_paid_count or 0
    pmt_unpaid_count = result.pmt_unpaid_count or 0
    pmt_collected_paid = result.pmt_collected_paid or 0.0
    pmt_out_paid = result.pmt_out_paid or 0.0
    pmt_out_unpaid = result.pmt_out_unpaid or 0.0

    # Calculate derived metrics
    avg_per_policy = round((total_outstanding_val / total_records), 0) if total_records else 0.0
    avg_years = round(avg_policy_ageing / 365, 1)
    high_propensity_pct = round((high_propensity_count / total_records) * 100, 1)
    grace_pct = round((grace_count / total_records) * 100, 1)
    pmt_payment_rate = round((pmt_paid_count / total_records) * 100, 1) if total_records else 0.0
    payment_outstanding_pct = round((pmt_collected_paid / total_outstanding_val) * 100, 1) if total_outstanding_val else 0.0

    # Assemble Exactly with sub-metric nodes matching the requested screenshot keys
    return {
        "header": f"CORE KPIS — {total_records:,} POLICIES",
        "total_policies": {
            "value_raw": total_records,
            "label_primary": f"{total_records:,}",
            "label_subtitle": "Total Active Policies"
        },
        "total_outstanding_premium": {
            "value_raw": float(total_outstanding_val),
            "label_primary": f"₹{round(total_outstanding_val / 10000000, 2)}Cr",
            "label_subtitle": f"Avg ₹{int(avg_per_policy):,}/policy"
        },
        "policy_count_pmt": {
            "value_raw": pmt_paid_count,
            "label_primary": f"{pmt_paid_count:,} Paid",
            "label_subtitle": f"{pmt_unpaid_count:,} Unpaid"
        },
        "amount_collected_pmt": {
            "value_raw": float(pmt_collected_paid),
            "label_primary": f"₹{round(pmt_collected_paid / 10000000, 2)}Cr",
            "label_subtitle": "Collected (Paid Flag)"
        },
        "outstanding_pmt": {
            "value_raw": float(pmt_out_unpaid),
            "label_primary": f"₹{round(pmt_out_unpaid / 10000000, 2)}Cr",
            "label_subtitle": "Unpaid Flag Outstanding"
        },
        "payment_rate_pmt": {
            "value_pct": float(pmt_payment_rate),
            "label_primary": f"{pmt_payment_rate}%",
            "label_subtitle": "Payment Rate (PMT Flag)"
        },
        "avg_lapse_ageing": {
            "value_raw": float(avg_lapse),
            "label_primary": str(avg_lapse),
            "label_subtitle": f"Max {max_lapse} days lapsed"
        },
        "total_interest_charged": {
            "value_raw": float(total_interest_val),
            "label_primary": f"₹{round(total_interest_val / 10000000, 2)}Cr",
            "label_subtitle": "Penal interest on lapse"
        },
        "avg_policy_ageing": {
            "value_raw": float(avg_policy_ageing),
            "label_primary": f"{int(avg_policy_ageing)} days",
            "label_subtitle": f"~{avg_years} year average to lapse"
        },
        "high_propensity": {
            "value_pct": float(high_propensity_pct),
            "label_primary": f"{high_propensity_pct}%",
            "label_subtitle": f"{high_propensity_count:,} policies"
        },
        "grace_bucket": {
            "value_pct": float(grace_pct),
            "label_primary": f"{grace_pct}%",
            "label_subtitle": f"{grace_count:,} in Grace PTD slab"
        },
        "payment_outstanding_pct": {
            "value_pct": float(payment_outstanding_pct),
            "label_primary": f"{payment_outstanding_pct}%",
            "label_subtitle": f"₹{round(pmt_collected_paid / 10000000, 2)}Cr of ₹{round(total_outstanding_val / 10000000, 2)}Cr collected"
        }
    }


@router.get("/payment-outstanding-pct")
def get_payment_outstanding_percentage(
    dataset_month: Optional[date] = Query(None, description="Filter metrics by a specific month"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns the payment outstanding percentage: (amount collected by PMT flag / total outstanding premium) * 100
    """
    from sqlalchemy import case

    aggregated = db.query(
        func.sum(LifeCampaignRecord.outstanding_premium).label('total_outstanding'),
        func.sum(case((LifeCampaignRecord.pmt_flag == True, LifeCampaignRecord.act_premium), else_=0)).label('pmt_collected_paid'),
    ).filter(LifeCampaignRecord.tenant_id == current_user.tenant_id)

    if dataset_month:
        aggregated = aggregated.filter(LifeCampaignRecord.dataset_month == dataset_month)

    result = aggregated.first()

    total_outstanding_val = result.total_outstanding or 0.0
    pmt_collected_paid = result.pmt_collected_paid or 0.0

    payment_outstanding_pct = round((pmt_collected_paid / total_outstanding_val) * 100, 1) if total_outstanding_val else 0.0

    return {
        "payment_outstanding_pct": float(payment_outstanding_pct),
        "amount_collected": float(pmt_collected_paid),
        "total_outstanding": float(total_outstanding_val),
        "label_primary": f"{payment_outstanding_pct}%",
        "label_subtitle": f"₹{round(pmt_collected_paid / 10000000, 2)}Cr of ₹{round(total_outstanding_val / 10000000, 2)}Cr collected"
    }
