from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from datetime import date

from app.api.dependencies import get_db
from app.services.ml_models.life_insurance.logistic_v2 import train_logistic_model

router = APIRouter()

@router.post("/train/logistic-v2")
def train_model(
    test_month: date = Query(...),
    db: Session = Depends(get_db)
):
    return train_logistic_model(db, test_month)


