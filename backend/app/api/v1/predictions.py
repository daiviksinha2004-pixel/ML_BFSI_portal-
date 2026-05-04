"""
FastAPI router for lapse prediction and KPI forecasting.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.dependencies import get_db, get_current_user
from app.models.platform import User
from app.services.prediction_service import PredictionService
from app.schemas.prediction_schema import LapseForecastRequest, LapseForecastResponse

router = APIRouter()


@router.post("/lapse-forecast", response_model=LapseForecastResponse)
def generate_lapse_forecast(
    request: LapseForecastRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Generate lapse forecast for the target month using rolling 4-month average.
    
    The forecast uses:
    - Policy aging (days since policy issue)
    - Lapse aging (days since last payment)
    - Rolling 4-month average of paid percentage
    
    Process:
    1. Get last 4 months before target_month
    2. Calculate average paid percentage for each (product_group, policy_aging_band, lapse_aging_band) combination
    3. Apply average to target month policy counts to forecast paid policies
    
    Args:
        request: LapseForecastRequest with target_month and optional product_groups
        db: Database session
        current_user: Authenticated user
    
    Returns:
        LapseForecastResponse with forecast data including:
        - summary_by_product_group: Aggregated forecast per product group
        - band_level_forecast: Detailed forecast per aging band combination
        - monthly_breakdown: Historical data for comparison months
    """
    try:
        service = PredictionService(db, current_user.tenant_id)
        response = service.generate_lapse_forecast(request)
        return response
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate forecast: {str(e)}")
