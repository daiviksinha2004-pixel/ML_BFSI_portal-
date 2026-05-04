from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import date
from typing import Optional, Literal
from app.api.dependencies import get_db, get_current_user
from app.models.platform import User
# Import our new specialized service engines!
from app.services.analytics_life import calculate_life_kpis, calculate_sourcing_channel_performance, calculate_premium_cash_flow_trajectory, calculate_lapse_hazard_curve_by_payment_frequency, calculate_cumulative_value_vs_discontinuation_spike
from app.services.analytics_debt import calculate_debt_kpis
from sqlalchemy import func
from app.models.collections import CollectionRecord
from app.models.insurance import LifeCampaignRecord

router = APIRouter()

@router.get("/summary/{domain_type}")
def get_portfolio_summary(
    domain_type: str, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Fetches the top-level KPI numbers for the dashboard cards."""
    
    if domain_type == "debt_collection":
        total_records = db.query(CollectionRecord).filter(CollectionRecord.tenant_id == current_user.tenant_id).count()
        total_pos = db.query(func.sum(CollectionRecord.total_pos)).filter(CollectionRecord.tenant_id == current_user.tenant_id).scalar() or 0
        return {
            "total_records": total_records, 
            "total_pos": total_pos
        }
        
    elif domain_type == "life_insurance":
        total_records = db.query(LifeCampaignRecord).filter(LifeCampaignRecord.tenant_id == current_user.tenant_id).count()
        total_outstanding = db.query(func.sum(LifeCampaignRecord.outstanding_premium)).filter(LifeCampaignRecord.tenant_id == current_user.tenant_id).scalar() or 0
        return {
            "total_records": total_records, 
            "total_outstanding_premium": total_outstanding
        }
        
    return {"total_records": 0, "total_pos": 0}





@router.get("/charts/{domain_type}")
def get_dashboard_charts(
    domain_type: str, 
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Fetches real database data formatted specifically for Recharts."""
    
    # 1. Determine which table to query
    if domain_type == "debt_collection":
        model = CollectionRecord
        amount_col = model.total_pos
        risk_col = model.propensity
    elif domain_type == "life_insurance":
        model = LifeCampaignRecord
        amount_col = model.outstanding_premium
        risk_col = model.policy_status # Using status as a proxy for risk in life
    else:
        return {"trend": [], "pie": []}

    try:
        # 2. Query Trend Data (Group by Month)
        trend_query = db.query(
            model.dataset_month, 
            func.sum(amount_col).label("total_amount")
        ).filter(model.tenant_id == current_user.tenant_id).group_by(model.dataset_month).order_by(model.dataset_month).all()

        trend_data = [
            {
                "month": record.dataset_month.strftime("%b %Y") if record.dataset_month else "Unknown", 
                "amount": float(record.total_amount or 0)
            } 
            for record in trend_query
        ]

        # 3. Query Pie Chart Data (Group by Risk/Propensity)
        pie_query = db.query(
            risk_col, 
            func.count(model.id).label("count")
        ).filter(model.tenant_id == current_user.tenant_id).group_by(risk_col).all()

        pie_data = [
            {
                "name": str(record[0]) if record[0] else "Unknown", 
                "value": int(record.count)
            } 
            for record in pie_query if record[0]
        ]

        return {
            "trend": trend_data,
            "pie": pie_data
        }
        
    except Exception as e:
        return {"trend": [], "pie": [], "error": str(e)}


@router.get("/{domain_type}/kpis")
def get_dashboard_kpis(
    domain_type: str, 
    dataset_month: Optional[date] = Query(None, description="Filter by YYYY-MM-DD from the dashboard slicer"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Acts as a traffic cop. Receives the request and routes it to the 
    correct analytical engine based on the domain_type.
    """
    
    if domain_type == "life_insurance":
        # Pass the database connection and the slicer date to the Life engine
        data = calculate_life_kpis(db, dataset_month, current_user.tenant_id)
        
        # Merge the engine's data with the routing info and return it
        return {
            "domain": domain_type,
            "filtered_month": dataset_month,
            **data  # Unpacks the kpis and charts from the service
        }
        
    elif domain_type == "debt_collection":
        # Pass the database connection and the slicer date to the Debt engine
        data = calculate_debt_kpis(db, dataset_month, current_user.tenant_id)
        
        return {
            "domain": domain_type,
            "filtered_month": dataset_month,
            **data
        }

    raise HTTPException(status_code=501, detail=f"Analytics for {domain_type} not yet implemented.")


@router.get("/life_insurance/sourcing-channel-performance")
def get_sourcing_channel_performance(
    pmt_filter: Literal["paid", "unpaid", "all"] = Query("all", description="Filter by payment status: paid, unpaid, or all"),
    dataset_month: Optional[date] = Query(None, description="Filter by YYYY-MM-DD from the dashboard slicer"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns sourcing channel performance data grouped by channel (Agency, HDFC Bank, Banca, DM).
    Sums act_premium (Column 23) for each channel.
    Filters by pmt_flag to show paid/unpaid status.
    Data formatted for horizontal bar chart.
    """
    data = calculate_sourcing_channel_performance(
        db=db,
        tenant_id=current_user.tenant_id,
        pmt_filter=pmt_filter,
        dataset_month=dataset_month
    )

    return data


@router.get("/life_insurance/premium-cash-flow-trajectory")
def get_premium_cash_flow_trajectory(
    granularity: Literal["month", "quarter"] = Query("month", description="Group by month or quarter"),
    dataset_month: Optional[date] = Query(None, description="Filter by YYYY-MM-DD from the dashboard slicer"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns premium cash flow trajectory (Revenue Curve).
    Groups by last paid date (Column 13) and sums premium amount (Column 23 - act_premium).
    Highlights seasonality in premium collections.
    Data formatted for area chart.
    """
    data = calculate_premium_cash_flow_trajectory(
        db=db,
        tenant_id=current_user.tenant_id,
        granularity=granularity,
        dataset_month=dataset_month
    )

    return data


@router.get("/life_insurance/lapse-hazard-curve-by-payment-frequency")
def get_lapse_hazard_curve_by_payment_frequency(
    pmt_filter: Literal["paid", "unpaid", "all"] = Query("all", description="Filter by payment status: paid, unpaid, or all"),
    granularity: Literal["month", "quarter"] = Query("month", description="Group by month or quarter"),
    dataset_month: Optional[date] = Query(None, description="Filter by YYYY-MM-DD from the dashboard slicer"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns lapse hazard curve by payment frequency.
    Plots the rate at which policies fail, split by payment frequency (1=Annual, 3=Quarterly, 6=Half-Yearly, 12=Monthly).
    Uses policy_lapse_date for timeline and counts policies where status = 'Lapse'.
    Can filter by pmt_flag to show paid/unpaid status.
    Data formatted for multi-line spline chart.
    """
    data = calculate_lapse_hazard_curve_by_payment_frequency(
        db=db,
        tenant_id=current_user.tenant_id,
        pmt_filter=pmt_filter,
        granularity=granularity,
        dataset_month=dataset_month
    )

    return data


@router.get("/life_insurance/cumulative-value-vs-discontinuation-spike")
def get_cumulative_value_vs_discontinuation_spike(
    granularity: Literal["month", "quarter"] = Query("month", description="Group by month or quarter"),
    dataset_month: Optional[date] = Query(None, description="Filter by YYYY-MM-DD from the dashboard slicer"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns cumulative premium value vs discontinuation spike.
    Contrasts accumulation of premium wealth against volume of surrendered/discontinued policies.
    Uses policy_issue_date (Vintage) for X-axis, cumulative sum of premium for primary Y-axis,
    and count of status = 'Discontinue' or 'Lapse' for secondary Y-axis.
    Data formatted for dual-axis chart with area and bars.
    """
    data = calculate_cumulative_value_vs_discontinuation_spike(
        db=db,
        tenant_id=current_user.tenant_id,
        granularity=granularity,
        dataset_month=dataset_month
    )

    return data