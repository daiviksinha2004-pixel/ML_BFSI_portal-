"""
FastAPI router for lapse prediction endpoint.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.dependencies import get_db, get_current_user
from app.models.platform import User
from app.services.lapse_prediction_service import LapsePredictionService
from app.schemas.lapse_prediction import LapsePredictionRequest, LapsePredictionResponse
from app.services.prediction_cache_service import cache_product_group_prediction

router = APIRouter()


@router.post("/lapse", response_model=LapsePredictionResponse)
def predict_lapse(
    request: LapsePredictionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Generate lapse prediction for the target month using historical data.
    
    The prediction uses:
    - Policy aging (years since policy issue)
    - Lapse aging (days since last payment)
    - Historical paid percentage from 4 reference months (T-1, T-2, T-3, T-12)
    
    Process:
    1. Calculate aging fields for each record
    2. Apply aging bands (lapse: 0-30, 30-60, etc.; policy: 0-1, 1-2, etc.)
    3. Compute paid % per (product_group, policy_aging_band, lapse_aging_band) for reference months
    4. Average paid % across reference months for each product group
    5. Apply historical paid % to target month policy counts by lapse band
    6. Aggregate predictions by product group and overall
    
    Args:
        request: LapsePredictionRequest with target_month
        db: Database session
        current_user: Authenticated user
    
    Returns:
        LapsePredictionResponse with prediction data including:
        - summary: Overall prediction metrics
        - by_product_group: Detailed predictions per product group with lapse band breakdown
        - reference_month_details: Historical paid % for each reference month
    """
    try:
        service = LapsePredictionService(db)
        response = service.generate_prediction(request.target_month, current_user.tenant_id)

        # Persist results to cache for collective prediction view
        cache_product_group_prediction(
            db, current_user.id, current_user.tenant_id, response
        )

        return response
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate prediction: {str(e)}")
