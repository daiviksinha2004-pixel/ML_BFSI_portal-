"""
FastAPI router for channel-based lapse prediction endpoint.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.dependencies import get_db, get_current_user
from app.models.platform import User
from app.services.channel_prediction_service import ChannelPredictionService
from app.schemas.channel_prediction import ChannelPredictionRequest, ChannelPredictionResponse
from app.services.prediction_cache_service import cache_channel_prediction

router = APIRouter()


@router.post("/lapse", response_model=ChannelPredictionResponse)
def predict_lapse_by_channel(
    request: ChannelPredictionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Generate channel-based lapse prediction for the target month using historical data.
    
    The prediction uses:
    - Policy aging (years since policy issue)
    - Lapse aging (days since last payment)
    - Historical paid percentage from 4 reference months (T-1, T-2, T-3, T-4)
    - Grouped by distribution channel instead of product group
    
    Process:
    1. Calculate aging fields for each record
    2. Apply aging bands (lapse: 0-30, 30-60, etc.; policy: 0-1, 1-2, etc.)
    3. Compute paid % per (channel, policy_aging_band, lapse_aging_band) for reference months
    4. Average paid % across reference months for each channel
    5. Apply historical paid % to target month policy counts by lapse band
    6. Aggregate predictions by channel and overall
    
    Args:
        request: ChannelPredictionRequest with target_month
        db: Database session
        current_user: Authenticated user
    
    Returns:
        ChannelPredictionResponse with prediction data including:
        - summary: Overall prediction metrics
        - by_channel: Detailed predictions per channel with lapse band breakdown
        - reference_month_details: Historical paid % for each reference month
    """
    try:
        service = ChannelPredictionService(db)
        response = service.generate_prediction(request.target_month, current_user.tenant_id)

        # Persist results to cache for collective prediction view
        cache_channel_prediction(
            db, current_user.id, current_user.tenant_id, response
        )

        return response
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate prediction: {str(e)}")
