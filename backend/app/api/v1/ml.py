"""
ML Router  —  app/api/v1/ml.py

Mount in main.py like:
    app.include_router(ml_router, prefix="/api/v1/ml", tags=["ML"])
"""

from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from datetime import date
import os
import joblib
import pandas as pd
import numpy as np
import logging

from app.api.dependencies import get_db
from app.services.ml_life import (
    train_and_evaluate_life_model,
    LIFE_MODEL_PATH,
    LIFE_FEATURES_PATH,
    LIFE_SCALER_PATH,
    LIFE_THRESHOLD_PATH,
    _sanitize_row as _life_sanitize_row,
)
from app.services.ml_debt import (
    train_and_evaluate_debt_model,
    DEBT_MODEL_PATH,
    DEBT_FEATURES_PATH,
    DEBT_SCALER_PATH,
    DEBT_THRESHOLD_PATH,
    _sanitize_row as _debt_sanitize_row,
    _build_feature_df as _debt_build_feature_df,
    QUERY_COLS as DEBT_QUERY_COLS,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Machine Learning"])

# ── simple in-process training-state tracker ──────────────────────────────────
_training_state: dict[str, str] = {
    "life": "idle",   # idle | running | done | failed
    "debt": "idle",
}


# ══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def _validate_test_month(test_month: date) -> None:
    if test_month > date.today():
        raise HTTPException(
            status_code=422,
            detail=(
                f"test_month '{test_month}' is in the future. "
                "Provide a past or current month that has records."
            ),
        )


def _model_ready(*paths: str) -> bool:
    return all(os.path.exists(p) for p in paths)


def _load_life_artifacts():
    if not _model_ready(LIFE_MODEL_PATH, LIFE_FEATURES_PATH):
        raise HTTPException(
            status_code=503,
            detail=(
                "Life insurance model has not been trained yet. "
                "Call POST /train/life-insurance first."
            ),
        )
    model     = joblib.load(LIFE_MODEL_PATH)
    features  = joblib.load(LIFE_FEATURES_PATH)
    scaler    = joblib.load(LIFE_SCALER_PATH)    if os.path.exists(LIFE_SCALER_PATH)    else None
    threshold = joblib.load(LIFE_THRESHOLD_PATH) if os.path.exists(LIFE_THRESHOLD_PATH) else 0.50
    return model, features, scaler, threshold


def _load_debt_artifacts():
    if not _model_ready(DEBT_MODEL_PATH, DEBT_FEATURES_PATH):
        raise HTTPException(
            status_code=503,
            detail=(
                "Debt collection model has not been trained yet. "
                "Call POST /train/debt-collection first."
            ),
        )
    model     = joblib.load(DEBT_MODEL_PATH)
    features  = joblib.load(DEBT_FEATURES_PATH)
    scaler    = joblib.load(DEBT_SCALER_PATH)    if os.path.exists(DEBT_SCALER_PATH)    else None
    threshold = joblib.load(DEBT_THRESHOLD_PATH) if os.path.exists(DEBT_THRESHOLD_PATH) else 0.50
    return model, features, scaler, threshold


def _score_single_life(model, features: list, scaler, threshold: float, raw: dict) -> dict:
    """Score one life-insurance customer payload."""
    clean = _life_sanitize_row(raw)
    row   = pd.DataFrame([clean])

    obj_cols = row.select_dtypes(include=["object", "string"]).columns.tolist()
    if obj_cols:
        row = pd.get_dummies(row, columns=obj_cols, drop_first=True, dummy_na=True)

    for c in row.select_dtypes(include=["bool"]).columns:
        row[c] = row[c].astype(int)

    row    = row.reindex(columns=features, fill_value=0).fillna(0)
    scaled = scaler.transform(row) if scaler is not None else row.values
    prob   = float(model.predict_proba(scaled)[0][1])
    pred   = int(prob >= threshold)
    dist   = abs(prob - 0.5)

    return {
        "propensity_score": round(prob, 4),
        "threshold_used":   threshold,
        "prediction":       pred,
        "prediction_label": "Will Pay" if pred == 1 else "Will Default",
        "confidence":       "High" if dist > 0.25 else "Medium" if dist > 0.10 else "Low",
    }


def _score_single_debt(model, features: list, scaler, threshold: float, raw: dict) -> dict:
    """
    Score one debt-collection customer payload.
    Uses the same feature-engineering pipeline as training (_build_feature_df).
    """
    # Keep only the columns the training pipeline expects
    clean = _debt_sanitize_row(raw)

    # Need a dummy dataset_month so _build_feature_df doesn't crash
    if not clean.get("dataset_month"):
        clean["dataset_month"] = str(date.today().replace(day=1))

    row = pd.DataFrame([clean])
    row = _debt_build_feature_df(row)

    # Drop the temporal split column if it survived
    if "dataset_month" in row.columns:
        row = row.drop(columns=["dataset_month"])

    for c in row.select_dtypes(include=["bool"]).columns:
        row[c] = row[c].astype(int)

    row    = row.reindex(columns=features, fill_value=0).fillna(0)
    scaled = scaler.transform(row) if scaler is not None else row.values
    prob   = float(model.predict_proba(scaled)[0][1])
    pred   = int(prob >= threshold)
    dist   = abs(prob - 0.5)

    return {
        "propensity_score": round(prob, 4),
        "threshold_used":   threshold,
        "prediction":       pred,
        "prediction_label": "Will Pay" if pred == 1 else "Will Default",
        "confidence":       "High" if dist > 0.25 else "Medium" if dist > 0.10 else "Low",
    }


def _score_batch_life(
    model, features: list, scaler, threshold: float, payload: list[dict]
) -> list[dict]:
    """Score a list of life-insurance customer dicts."""
    clean_rows = [_life_sanitize_row(r) for r in payload]
    df = pd.DataFrame(clean_rows)

    obj_cols = df.select_dtypes(include=["object", "string"]).columns.tolist()
    if obj_cols:
        df = pd.get_dummies(df, columns=obj_cols, drop_first=True, dummy_na=True)

    for c in df.select_dtypes(include=["bool"]).columns:
        df[c] = df[c].astype(int)

    df     = df.reindex(columns=features, fill_value=0).fillna(0)
    scaled = scaler.transform(df) if scaler is not None else df.values
    probs  = model.predict_proba(scaled)[:, 1]
    preds  = (probs >= threshold).astype(int)

    results = []
    for i, (prob, pred) in enumerate(zip(probs, preds)):
        dist = abs(float(prob) - 0.5)
        results.append({
            "index":            i,
            "propensity_score": round(float(prob), 4),
            "threshold_used":   threshold,
            "prediction":       int(pred),
            "prediction_label": "Will Pay" if pred == 1 else "Will Default",
            "confidence":       "High" if dist > 0.25 else "Medium" if dist > 0.10 else "Low",
        })
    return results


def _score_batch_debt(
    model, features: list, scaler, threshold: float, payload: list[dict]
) -> list[dict]:
    """Score a list of debt-collection customer dicts using the same pipeline as training."""
    today_month = str(date.today().replace(day=1))
    clean_rows = []
    for r in payload:
        clean = _debt_sanitize_row(r)
        if not clean.get("dataset_month"):
            clean["dataset_month"] = today_month
        clean_rows.append(clean)

    df = pd.DataFrame(clean_rows)
    df = _debt_build_feature_df(df)

    if "dataset_month" in df.columns:
        df = df.drop(columns=["dataset_month"])

    for c in df.select_dtypes(include=["bool"]).columns:
        df[c] = df[c].astype(int)

    df     = df.reindex(columns=features, fill_value=0).fillna(0)
    scaled = scaler.transform(df) if scaler is not None else df.values
    probs  = model.predict_proba(scaled)[:, 1]
    preds  = (probs >= threshold).astype(int)

    results = []
    for i, (prob, pred) in enumerate(zip(probs, preds)):
        dist = abs(float(prob) - 0.5)
        results.append({
            "index":            i,
            "propensity_score": round(float(prob), 4),
            "threshold_used":   threshold,
            "prediction":       int(pred),
            "prediction_label": "Will Pay" if pred == 1 else "Will Default",
            "confidence":       "High" if dist > 0.25 else "Medium" if dist > 0.10 else "Low",
        })
    return results


# ══════════════════════════════════════════════════════════════════════════════
# BACKGROUND TRAINING TASKS
# ══════════════════════════════════════════════════════════════════════════════

def _bg_train_life(test_month: date, db: Session) -> None:
    _training_state["life"] = "running"
    try:
        result = train_and_evaluate_life_model(db, test_month)
        _training_state["life"] = "done" if result["status"] == "success" else "failed"
        logger.info("Life model training finished: %s", result.get("status"))
    except Exception as exc:
        _training_state["life"] = "failed"
        logger.exception("Life model training crashed: %s", exc)


def _bg_train_debt(test_month: date, db: Session) -> None:
    _training_state["debt"] = "running"
    try:
        result = train_and_evaluate_debt_model(db, test_month)
        _training_state["debt"] = "done" if result["status"] == "success" else "failed"
        logger.info("Debt model training finished: %s", result.get("status"))
    except Exception as exc:
        _training_state["debt"] = "failed"
        logger.exception("Debt model training crashed: %s", exc)


# ══════════════════════════════════════════════════════════════════════════════
# TRAINING ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@router.post(
    "/train/life-insurance",
    summary="Train the Life Insurance propensity model",
)
def trigger_life_training(
    background_tasks: BackgroundTasks,
    test_month: date = Query(
        ...,
        description="Month to evaluate the model against (YYYY-MM-DD). Must not be in the future.",
    ),
    async_mode: bool = Query(
        False,
        description="If true, training runs in the background. Poll /status/life-insurance.",
    ),
    db: Session = Depends(get_db),
):
    _validate_test_month(test_month)

    if _training_state["life"] == "running":
        raise HTTPException(
            status_code=409,
            detail="Life model training is already running. Poll GET /status/life-insurance.",
        )

    if async_mode:
        background_tasks.add_task(_bg_train_life, test_month, db)
        return JSONResponse(
            status_code=202,
            content={
                "status":   "accepted",
                "message":  "Life model training started in background.",
                "poll_url": "/status/life-insurance",
            },
        )

    try:
        result = train_and_evaluate_life_model(db, test_month)
        _training_state["life"] = "done" if result["status"] == "success" else "failed"
        if result["status"] == "error":
            raise HTTPException(status_code=400, detail=result["message"])
        return result
    except HTTPException:
        raise
    except Exception as exc:
        _training_state["life"] = "failed"
        logger.exception("Life model training failed")
        raise HTTPException(status_code=500, detail=f"Model training failed: {exc}")


@router.post(
    "/train/debt-collection",
    summary="Train the Debt Collection propensity model",
)
def trigger_debt_training(
    background_tasks: BackgroundTasks,
    test_month: date = Query(
        ...,
        description="Month to evaluate the model against (YYYY-MM-DD). Must not be in the future.",
    ),
    async_mode: bool = Query(False),
    db: Session = Depends(get_db),
):
    _validate_test_month(test_month)

    if _training_state["debt"] == "running":
        raise HTTPException(
            status_code=409,
            detail="Debt model training is already running. Poll GET /status/debt-collection.",
        )

    if async_mode:
        background_tasks.add_task(_bg_train_debt, test_month, db)
        return JSONResponse(
            status_code=202,
            content={
                "status":   "accepted",
                "message":  "Debt model training started in background.",
                "poll_url": "/status/debt-collection",
            },
        )

    try:
        result = train_and_evaluate_debt_model(db, test_month)
        _training_state["debt"] = "done" if result["status"] == "success" else "failed"
        if result["status"] == "error":
            raise HTTPException(status_code=400, detail=result["message"])
        return result
    except HTTPException:
        raise
    except Exception as exc:
        _training_state["debt"] = "failed"
        logger.exception("Debt model training failed")
        raise HTTPException(status_code=500, detail=f"Model training failed: {exc}")


# ══════════════════════════════════════════════════════════════════════════════
# STATUS ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/status/life-insurance", summary="Check life model training status")
def life_status():
    return {
        "training_state": _training_state["life"],
        "model_ready":    _model_ready(LIFE_MODEL_PATH, LIFE_FEATURES_PATH),
    }


@router.get("/status/debt-collection", summary="Check debt model training status")
def debt_status():
    return {
        "training_state": _training_state["debt"],
        "model_ready":    _model_ready(DEBT_MODEL_PATH, DEBT_FEATURES_PATH),
    }


# ══════════════════════════════════════════════════════════════════════════════
# SINGLE PREDICTION ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@router.post(
    "/predict/life-insurance",
    summary="Score a single customer for life insurance payment propensity",
)
def predict_life(payload: dict):
    """
    Pass a flat JSON object of customer features — the same fields
    stored in life_campaign_records, minus leakage columns.

    Example:
    ```json
    { "outstanding_premium": 95694, "segment_code": "B.MEDIUM" }
    ```
    """
    if not payload:
        raise HTTPException(status_code=422, detail="Request body cannot be empty.")
    model, features, scaler, threshold = _load_life_artifacts()
    try:
        return _score_single_life(model, features, scaler, threshold, payload)
    except Exception as exc:
        logger.exception("Life single prediction error")
        raise HTTPException(status_code=500, detail=f"Prediction failed: {exc}")


@router.post(
    "/predict/debt-collection",
    summary="Score a single customer for debt collection propensity",
)
def predict_debt(payload: dict):
    """
    Pass a flat JSON object with the meaningful debt collection fields.

    Supported fields: total_pos, outstanding_amount, state, pincode,
                      inception_date, product_code, dataset_month

    Example:
    ```json
    {
      "total_pos": 186557,
      "outstanding_amount": 60000,
      "state": "ODISHA",
      "inception_date": "2024-04-09",
      "product_code": "TW"
    }
    ```
    """
    if not payload:
        raise HTTPException(status_code=422, detail="Request body cannot be empty.")
    model, features, scaler, threshold = _load_debt_artifacts()
    try:
        return _score_single_debt(model, features, scaler, threshold, payload)
    except Exception as exc:
        logger.exception("Debt single prediction error")
        raise HTTPException(status_code=500, detail=f"Prediction failed: {exc}")


# ══════════════════════════════════════════════════════════════════════════════
# BATCH PREDICTION ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@router.post(
    "/predict/life-insurance/batch",
    summary="Score up to 500 life-insurance customers at once",
)
def predict_life_batch(payload: list[dict]):
    if not payload:
        raise HTTPException(status_code=422, detail="Payload list cannot be empty.")
    if len(payload) > 500:
        raise HTTPException(
            status_code=413,
            detail="Batch size exceeds the limit of 500 records per request.",
        )
    model, features, scaler, threshold = _load_life_artifacts()
    try:
        return _score_batch_life(model, features, scaler, threshold, payload)
    except Exception as exc:
        logger.exception("Life batch prediction error")
        raise HTTPException(status_code=500, detail=f"Batch prediction failed: {exc}")


@router.post(
    "/predict/debt-collection/batch",
    summary="Score up to 500 debt-collection customers at once",
)
def predict_debt_batch(payload: list[dict]):
    if not payload:
        raise HTTPException(status_code=422, detail="Payload list cannot be empty.")
    if len(payload) > 500:
        raise HTTPException(status_code=413, detail="Batch size exceeds limit of 500 records.")
    model, features, scaler, threshold = _load_debt_artifacts()
    try:
        return _score_batch_debt(model, features, scaler, threshold, payload)
    except Exception as exc:
        logger.exception("Debt batch prediction error")
        raise HTTPException(status_code=500, detail=f"Batch prediction failed: {exc}")