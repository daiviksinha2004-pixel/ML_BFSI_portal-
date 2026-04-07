from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import date
from typing import Optional
from app.api.dependencies import get_db

# Import our new specialized service engines!
from app.services.analytics_life import calculate_life_kpis
from app.services.analytics_debt import calculate_debt_kpis
from sqlalchemy import func
from app.models.collections import CollectionRecord
from app.models.insurance import LifeCampaignRecord

router = APIRouter()

@router.get("/summary/{domain_type}")
def get_portfolio_summary(domain_type: str, db: Session = Depends(get_db)):
    """Fetches the top-level KPI numbers for the dashboard cards."""
    
    if domain_type == "debt_collection":
        total_records = db.query(CollectionRecord).count()
        total_pos = db.query(func.sum(CollectionRecord.total_pos)).scalar() or 0
        return {
            "total_records": total_records, 
            "total_pos": total_pos
        }
        
    elif domain_type == "life_insurance":
        total_records = db.query(LifeCampaignRecord).count()
        total_outstanding = db.query(func.sum(LifeCampaignRecord.outstanding_premium)).scalar() or 0
        return {
            "total_records": total_records, 
            "total_outstanding_premium": total_outstanding
        }
        
    return {"total_records": 0, "total_pos": 0}





@router.get("/charts/{domain_type}")
def get_dashboard_charts(domain_type: str, db: Session = Depends(get_db)):
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
        ).group_by(model.dataset_month).order_by(model.dataset_month).all()

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
        ).group_by(risk_col).all()

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
    db: Session = Depends(get_db)
):
    """
    Acts as a traffic cop. Receives the request and routes it to the 
    correct analytical engine based on the domain_type.
    """
    
    if domain_type == "life_insurance":
        # Pass the database connection and the slicer date to the Life engine
        data = calculate_life_kpis(db, dataset_month)
        
        # Merge the engine's data with the routing info and return it
        return {
            "domain": domain_type,
            "filtered_month": dataset_month,
            **data  # Unpacks the kpis and charts from the service
        }
        
    elif domain_type == "debt_collection":
        # Pass the database connection and the slicer date to the Debt engine
        data = calculate_debt_kpis(db, dataset_month)
        
        return {
            "domain": domain_type,
            "filtered_month": dataset_month,
            **data
        }

    raise HTTPException(status_code=501, detail=f"Analytics for {domain_type} not yet implemented.")