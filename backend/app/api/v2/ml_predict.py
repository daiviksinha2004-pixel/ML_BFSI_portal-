from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, create_model

from app.api.dependencies import get_db
from app.services.ml_models.life_insurance.logistic_v2 import load_schema_from_db
from app.services.ml_models.life_insurance.logistic_predict_v2 import (
    predict_single,
    predict_batch,
    debug_payload,
)

router = APIRouter(tags=["ML V2 Prediction"])


# =========================================================
# DYNAMIC SCHEMA — built from DB at request time
# =========================================================
def get_life_payload_model(db: Session):
    """
    Reads raw_columns from ml_feature_schemas and returns
    a Pydantic model with exactly those fields — all Optional.
    Swagger UI will show the real field list automatically.
    """
    schema   = load_schema_from_db(db)
    raw_cols = schema["raw_columns"]

    # Map common SQL types → Python types for Pydantic
    from app.models.insurance import LifeCampaignRecord
    col_type_map = {
        c.name: c.type for c in LifeCampaignRecord.__table__.columns
    }

    import sqlalchemy as sa
    from decimal import Decimal
    from datetime import date
    from uuid import UUID

    def sql_to_py(col_name):
        col_type = col_type_map.get(col_name)
        if col_type is None:
            return (Optional[str], None)
        t = type(col_type)
        if t in (sa.Integer, sa.SmallInteger):
            return (Optional[int], None)
        if t == sa.Boolean:
            return (Optional[bool], None)
        if t == sa.Numeric:
            return (Optional[Decimal], None)
        if t == sa.Date:
            return (Optional[date], None)
        if t == sa.DateTime:
            return (Optional[str], None)
        return (Optional[str], None)

    fields = {col: sql_to_py(col) for col in raw_cols}
    return create_model("LifePredictPayload", **fields)


# =========================================================
# ENDPOINTS
# =========================================================
class PredictResponse(BaseModel):
    index:             int
    propensity_score:  float
    prediction:        int
    prediction_label:  str
    confidence:        str


@router.post("/predict/logistic-v2", response_model=PredictResponse)
def predict_one(payload: dict, db: Session = Depends(get_db)):
    # validate against dynamic model
    DynamicModel = get_life_payload_model(db)
    try:
        validated = DynamicModel(**payload)
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))
    try:
        return predict_single(validated.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/predict/logistic-v2/batch", response_model=List[PredictResponse])
def predict_many(payload: List[dict], db: Session = Depends(get_db)):
    if not payload:
        raise HTTPException(status_code=422, detail="Empty payload")
    DynamicModel = get_life_payload_model(db)
    try:
        validated = [DynamicModel(**p).model_dump() for p in payload]
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))
    try:
        return predict_batch(validated)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/predict/logistic-v2/schema")
def get_schema(db: Session = Depends(get_db)):
    """Returns the current feature schema stored in DB — useful for frontend form generation."""
    try:
        return load_schema_from_db(db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/predict/logistic-v2/debug")
def debug_one(payload: dict, db: Session = Depends(get_db)):
    try:
        return debug_payload(payload)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))