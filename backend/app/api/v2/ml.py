from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from datetime import date

from app.api.dependencies import get_db
from app.services.ml_models.life_insurance.logistic_v2 import train_logistic_model

router = APIRouter()
SUPPORTED_LOGISTIC_DOMAIN = "life_insurance"


def _validate_logistic_domain(domain: str) -> None:
    if domain != SUPPORTED_LOGISTIC_DOMAIN:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Domain '{domain}' is not supported for logistic-v2. "
                f"Supported domain: '{SUPPORTED_LOGISTIC_DOMAIN}'."
            ),
        )


@router.post("/train/logistic-v2")
def train_model(
    test_month: date = Query(...),
    domain: str = Query(
        SUPPORTED_LOGISTIC_DOMAIN,
        description="Domain for logistic-v2 training. Currently only life_insurance is supported.",
    ),
    db: Session = Depends(get_db)
):
    _validate_logistic_domain(domain)
    return train_logistic_model(db, test_month)


