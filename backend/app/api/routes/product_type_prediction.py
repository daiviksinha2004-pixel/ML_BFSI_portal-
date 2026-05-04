"""
FastAPI router for product type-based lapse prediction endpoint.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.dependencies import get_db, get_current_user
from app.models.platform import User
from app.services.product_type_prediction_service import ProductTypePredictionService
from app.schemas.product_type_prediction import ProductTypePredictionRequest, ProductTypePredictionResponse
from app.services.prediction_cache_service import cache_product_type_prediction

router = APIRouter()


@router.post("/lapse", response_model=ProductTypePredictionResponse)
def predict_lapse_by_product_type(
    request: ProductTypePredictionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Generate product type-based lapse prediction for the target month using historical data.
    
    The prediction uses:
    - Policy aging (years since policy issue)
    - Lapse aging (days since last payment)
    - Historical paid percentage from 4 reference months (T-1, T-2, T-3, T-4)
    - Grouped by product type instead of product group or channel
    
    Process:
    1. Calculate aging fields for each record
    2. Apply aging bands (lapse: 0-30, 30-60, etc.; policy: 0-1, 1-2, etc.)
    3. Compute paid % per (product_type, policy_aging_band, lapse_aging_band) for reference months
    4. Average paid % across reference months for each product type
    5. Apply historical paid % to target month policy counts by lapse band
    6. Aggregate predictions by product type and overall
    
    Args:
        request: ProductTypePredictionRequest with target_month
        db: Database session
        current_user: Authenticated user
    
    Returns:
        ProductTypePredictionResponse with prediction data including:
        - summary: Overall prediction metrics
        - by_product_type: Detailed predictions per product type with lapse band breakdown
        - reference_month_details: Historical paid % for each reference month
    """
    try:
        service = ProductTypePredictionService(db)
        response = service.generate_prediction(request.target_month, current_user.tenant_id)

        # Persist results to cache for collective prediction view
        cache_product_type_prediction(
            db, current_user.id, current_user.tenant_id, response
        )

        return response
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate prediction: {str(e)}")
