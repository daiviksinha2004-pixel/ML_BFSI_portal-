import pandas as pd
import numpy as np
import joblib
import os

from app.services.ml_models.life_insurance.logistic_v2 import (
    build_features,
    sanitize_row,
    MODEL_PATH,
    FEATURES_PATH,
    SCALER_PATH,
    IMPUTER_PATH,
    ALLNAN_PATH,
    THRESHOLD_PATH,
)


# =========================================================
# LOAD ARTIFACTS (SAFE)
# =========================================================
def load_artifacts():
    required_paths = [MODEL_PATH, FEATURES_PATH, SCALER_PATH, IMPUTER_PATH, ALLNAN_PATH]

    for p in required_paths:
        if not os.path.exists(p):
            raise ValueError(
                f"Missing artifact: {p}. "
                "Please train the model first via POST /train/logistic-v2"
            )

    model = joblib.load(MODEL_PATH)
    features = joblib.load(FEATURES_PATH)  # columns AFTER zero-var drop
    scaler = joblib.load(SCALER_PATH)
    imputer = joblib.load(IMPUTER_PATH)
    all_nan_cols = joblib.load(ALLNAN_PATH)
    threshold = joblib.load(THRESHOLD_PATH) if os.path.exists(THRESHOLD_PATH) else 0.3

    return model, features, scaler, imputer, all_nan_cols, float(threshold)


# =========================================================
# PREPROCESS (matches training pipeline exactly)
# =========================================================
def preprocess_input(payload: list[dict]) -> pd.DataFrame:
    rows = [sanitize_row(r) for r in payload]
    df = pd.DataFrame(rows)

    # pmt_flag absent at inference -> build_features returns empty y, that is fine
    X, _, _ = build_features(df)
    return X


# =========================================================
# SINGLE PREDICTION
# =========================================================
def predict_single(payload: dict) -> dict:
    return predict_batch([payload])[0]


# =========================================================
# BATCH PREDICTION
# =========================================================
def predict_batch(payload: list[dict]) -> list[dict]:
    if not payload:
        raise ValueError("Payload cannot be empty")

    if len(payload) > 500:
        raise ValueError("Max 500 records allowed per batch")

    model, features, scaler, imputer, all_nan_cols, threshold = load_artifacts()

    # step 1: raw feature engineering
    X = preprocess_input(payload)

    # step 2: drop all-NaN cols (same as training)
    X = X.drop(columns=all_nan_cols, errors="ignore")

    # step 3: align columns to imputer input
    if hasattr(imputer, "feature_names_in_"):
        imputer_cols = list(imputer.feature_names_in_)
    else:
        # fallback: imputer was fit on a numpy array
        imputer_cols = features

    X = X.reindex(columns=imputer_cols, fill_value=np.nan)

    # step 4: impute
    X_imp = imputer.transform(X)

    # step 5: keep only non-zero-variance columns
    imputer_col_index = {col: i for i, col in enumerate(imputer_cols)}
    feature_indices = [imputer_col_index[f] for f in features if f in imputer_col_index]
    X_imp = X_imp[:, feature_indices]

    # step 6: scale
    X_scaled = scaler.transform(X_imp)

    # step 7: safety net
    X_scaled = np.nan_to_num(X_scaled, nan=0.0, posinf=0.0, neginf=0.0)

    # step 8: predict using dynamic threshold
    probs = model.predict_proba(X_scaled)[:, 1]
    preds = (probs >= threshold).astype(int)

    results = []
    for i, (prob, pred) in enumerate(zip(probs, preds)):
        prob = float(prob)
        dist = abs(prob - threshold)
        results.append(
            {
                "index": i,
                "propensity_score": round(prob, 4),
                "prediction": int(pred),
                "prediction_label": "Will Pay" if pred == 1 else "Will Default",
                "confidence": (
                    "High" if dist > 0.25 else "Medium" if dist > 0.10 else "Low"
                ),
            }
        )

    return results


def debug_payload(payload: dict) -> dict:
    from app.services.ml_models.life_insurance.logistic_v2 import DROP_COLS

    _, features, _, imputer, _all_nan_cols, threshold = load_artifacts()

    sanitized = sanitize_row(payload)
    df = pd.DataFrame([sanitized])

    try:
        X, _, _ = build_features(df)
        incoming_cols = X.columns.tolist()
        build_error = None
    except Exception as e:
        incoming_cols = []
        build_error = str(e)

    imputer_cols = list(imputer.feature_names_in_) if hasattr(imputer, "feature_names_in_") else []
    matched = [c for c in imputer_cols if c in incoming_cols]
    missing = [c for c in imputer_cols if c not in incoming_cols]
    extra = [c for c in incoming_cols if c not in imputer_cols]

    return {
        "raw_payload_keys": list(payload.keys()),
        "after_sanitize_keys": list(sanitized.keys()),
        "dropped_by_sanitize": [k for k in payload.keys() if k in DROP_COLS],
        "after_build_features": incoming_cols[:30],
        "build_error": build_error,
        "incoming_col_count": len(incoming_cols),
        "imputer_col_count": len(imputer_cols),
        "matched_col_count": len(matched),
        "missing_from_payload": missing[:20],
        "extra_in_payload": extra[:20],
        "inference_threshold": round(float(threshold), 4),
        "feature_count_after_var_drop": len(features),
    }

