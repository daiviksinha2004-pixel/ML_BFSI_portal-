import pandas as pd
import numpy as np
import os
import joblib
import logging
from datetime import date

from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score,
    f1_score, roc_auc_score, confusion_matrix
)
from sklearn.impute import SimpleImputer

from sqlalchemy.orm import Session
from app.models.insurance import LifeCampaignRecord
from app.models.ml_schemas import MLFeatureSchema

logger = logging.getLogger(__name__)

# =========================================================
# PATHS
# =========================================================
MODEL_DIR     = "app/ml/models/v2"
os.makedirs(MODEL_DIR, exist_ok=True)

MODEL_PATH    = os.path.join(MODEL_DIR, "life_logistic_v2.joblib")
FEATURES_PATH = os.path.join(MODEL_DIR, "life_features_v2.joblib")
SCALER_PATH   = os.path.join(MODEL_DIR, "life_scaler_v2.joblib")
IMPUTER_PATH  = os.path.join(MODEL_DIR, "life_imputer_v2.joblib")
ALLNAN_PATH   = os.path.join(MODEL_DIR, "life_allnan_v2.joblib")
THRESHOLD_PATH= os.path.join(MODEL_DIR, "life_threshold_v2.joblib")

MODEL_NAME    = "logistic_life"

# =========================================================
# COLUMNS TO ALWAYS DROP
# High-cardinality, identifiers, leakage, metadata
# =========================================================
DROP_COLS = {
    # primary keys / unique identifiers
    "id", "policy_no", "cust_id", "agent_code",
    "policy_number", "mobile_number",
    # foreign key UUIDs — each row is unique, get_dummies explodes
    "tenant_id", "client_id", "campaign_id", "batch_id",
    # target leakage
    "policy_status",
    # timestamps / metadata
    "created_at", "updated_at", "lot_date",
    # free-text / high-cardinality strings
    "raw_data",
    "product_name_raw", "product_category_raw",
    "pin_code", "city", "branch_name",
    "source_agency_name", "branch_code",
    "policy_source_code", "product_code",
    # SQLAlchemy internal
    "_sa_instance_state",
}

# Columns to KEEP for encoding — whitelist of low-cardinality categoricals
# Only these object columns will survive into get_dummies
CATEGORICAL_WHITELIST = {
    "policy_paying_frequency",
    "policy_paying_term",
    "policy_year",
    "product_type",
    "productgroup",
    "policy_ageing_band",
    "propensity_band",
    "ptd_slab",
    "client_bucket",
    "priority_bucket",
    "sub_campaign_name",
    "campaign_type_code",
    "agent_status",
    "channel",
    "payment_mode",
    "zone",
    "preferred_language",
    "state",
}

# =========================================================
# CLEANING
# =========================================================
def sanitize_row(raw: dict) -> dict:
    import json
    clean = {}
    for k, v in raw.items():
        if k in DROP_COLS:
            continue
        if isinstance(v, dict):
            clean[k] = json.dumps(v)
        elif isinstance(v, list):
            clean[k] = "|".join(map(str, v))
        elif v is None:
            clean[k] = np.nan
        else:
            clean[k] = v
    return clean


# =========================================================
# FEATURE ENGINEERING
# =========================================================
def build_features(df: pd.DataFrame):
    df = df.copy()

    # ── DATASET MONTH (temporal split key) ────────────────
    if "dataset_month" in df.columns:
        dataset_month = pd.to_datetime(df["dataset_month"], errors="coerce")
    else:
        dataset_month = pd.Series([pd.NaT] * len(df), index=df.index)

    df = df.drop(columns=["dataset_month"], errors="ignore")

    # ── DATE → NUMERIC FEATURES ───────────────────────────
    date_cols = [
        "policy_issue_date", "policy_lapse_date", "premium_due_date",
        "paid_to_date", "max_ri_date", "quotation_valid_upto_date",
    ]
    for col in date_cols:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce")

    now = pd.Timestamp.today()

    if "policy_issue_date" in df.columns:
        df["policy_age_months"] = (
            (now - df["policy_issue_date"]).dt.days / 30
        ).clip(lower=0)

    if "premium_due_date" in df.columns:
        df["months_to_due"] = (
            (df["premium_due_date"] - now).dt.days / 30
        )

    if "paid_to_date" in df.columns:
        df["days_since_paid"] = (
            (now - df["paid_to_date"]).dt.days
        ).clip(lower=0)

    if "policy_lapse_date" in df.columns:
        df["days_since_lapse"] = (
            (now - df["policy_lapse_date"]).dt.days
        ).clip(lower=0)

    # ── DROP DROP_COLS + ALL RAW DATETIMES ─────────────────
    df = df.drop(columns=[c for c in DROP_COLS if c in df.columns], errors="ignore")
    datetime_cols = df.select_dtypes(
        include=["datetime64[ns]", "datetime64[ns, UTC]", "datetime64"]
    ).columns
    df = df.drop(columns=datetime_cols, errors="ignore")

    # ── TARGET ────────────────────────────────────────────
    if "pmt_flag" in df.columns:
        df["pmt_flag"] = (
            df["pmt_flag"]
            .map({True: 1, False: 0, 1: 1, 0: 0})
            .fillna(0)
            .astype(int)
        )
        y = df.pop("pmt_flag")
    else:
        y = pd.Series(dtype=int)

    # ── DERIVED FEATURES ──────────────────────────────────
    if "outstanding_premium" in df.columns and "annual_premium" in df.columns:
        df["outstanding_ratio"] = (
            df["outstanding_premium"]
            / (df["annual_premium"].replace(0, np.nan) + 1)
        )

    if "modal_premium" in df.columns and "annual_premium" in df.columns:
        df["modal_to_annual_ratio"] = (
            df["modal_premium"]
            / (df["annual_premium"].replace(0, np.nan) + 1)
        )

    # ── CATEGORICAL ENCODING (whitelist only) ─────────────
    # Drop any object column NOT in the whitelist first
    # This prevents high-cardinality cols from exploding get_dummies
    all_obj_cols = df.select_dtypes(include=["object", "category"]).columns.tolist()
    cols_to_drop = [c for c in all_obj_cols if c not in CATEGORICAL_WHITELIST]
    if cols_to_drop:
        logger.info(f"Dropping non-whitelisted categoricals: {cols_to_drop}")
        df = df.drop(columns=cols_to_drop, errors="ignore")

    # Clean and cap remaining categoricals
    remaining_cats = df.select_dtypes(include=["object", "category"]).columns.tolist()
    for col in remaining_cats:
        df[col] = df[col].astype(str).str.strip()
        n_unique = df[col].nunique()
        logger.info(f"Encoding: {col} ({n_unique} unique values)")
        if n_unique > 20:
            logger.warning(f"Dropping {col} — {n_unique} unique values exceeds cap of 20")
            df.drop(columns=[col], inplace=True)

    # ── GUARD ─────────────────────────────────────────────
    if df.empty or df.shape[1] == 0:
        raise ValueError(
            "build_features produced an empty DataFrame. "
            "Ensure payload fields match training columns."
        )

    df = pd.get_dummies(df, drop_first=True)

    # Cast booleans → int (newer pandas)
    bool_cols = df.select_dtypes(include="bool").columns
    df[bool_cols] = df[bool_cols].astype(int)

    # Coerce everything to numeric
    df = df.apply(pd.to_numeric, errors="coerce")

    return df, y, dataset_month


# =========================================================
# SCHEMA HELPERS
# =========================================================
def save_schema_to_db(
    db: Session, metrics: dict,
    feature_names: list, imputer_cols: list,
    all_nan_cols: list, raw_columns: list,
):
    import uuid as _uuid
    existing = (
        db.query(MLFeatureSchema)
        .filter(MLFeatureSchema.model_name == MODEL_NAME)
        .first()
    )
    payload = dict(
        feature_names = feature_names,
        imputer_cols  = imputer_cols,
        all_nan_cols  = all_nan_cols,
        raw_columns   = raw_columns,
        drop_cols     = list(DROP_COLS),
        metrics       = metrics,
    )
    if existing:
        for k, v in payload.items():
            setattr(existing, k, v)
    else:
        db.add(MLFeatureSchema(
            id         = _uuid.uuid4(),
            model_name = MODEL_NAME,
            **payload,
        ))
    db.commit()


def load_schema_from_db(db: Session) -> dict:
    record = (
        db.query(MLFeatureSchema)
        .filter(MLFeatureSchema.model_name == MODEL_NAME)
        .first()
    )
    if not record:
        raise ValueError(
            f"No schema found for model '{MODEL_NAME}'. "
            "Please train the model first via POST /train/logistic-v2"
        )
    return {
        "feature_names": record.feature_names,
        "imputer_cols":  record.imputer_cols,
        "all_nan_cols":  record.all_nan_cols,
        "raw_columns":   record.raw_columns,
        "drop_cols":     record.drop_cols,
        "metrics":       record.metrics,
        "trained_at":    record.trained_at.isoformat() if record.trained_at else None,
    }


# =========================================================
# TRAIN
# =========================================================
def train_logistic_model(db: Session, test_month: date):

    # ── LOAD FROM DB ──────────────────────────────────────
    records = db.query(LifeCampaignRecord).all()
    if not records:
        return {"status": "error", "message": "No records found in DB."}

    # Capture raw column names for schema storage
    raw_columns = [
        c.name for c in LifeCampaignRecord.__table__.columns
        if c.name not in DROP_COLS
    ]

    rows = []
    for r in records:
        raw = r.__dict__.copy()
        raw.pop("_sa_instance_state", None)
        rows.append(sanitize_row(raw))

    df = pd.DataFrame(rows)

    logger.info(f"Loaded {len(df)} records, {df.shape[1]} columns before feature engineering")

    # ── BUILD FEATURES ────────────────────────────────────
    X, y, dataset_month = build_features(df)

    logger.info(f"After build_features: {X.shape[1]} columns, {len(X)} rows")

    dataset_month_date = dataset_month.dt.date

    # ── TRAIN / TEST SPLIT ────────────────────────────────
    train_mask = dataset_month_date < test_month
    test_mask  = dataset_month_date == test_month

    if train_mask.sum() == 0:
        return {"status": "error", "message": f"No training data before {test_month}."}
    if test_mask.sum() == 0:
        return {"status": "error", "message": f"No test data for month {test_month}."}

    X_train, y_train = X[train_mask], y[train_mask]
    X_test,  y_test  = X[test_mask],  y[test_mask]

    logger.info(f"Train: {len(X_train)} rows | Test: {len(X_test)} rows")

    X_test = X_test.reindex(columns=X_train.columns, fill_value=0)

    # ── DROP ALL-NaN COLUMNS ──────────────────────────────
    all_nan_cols = X_train.columns[X_train.isna().all()].tolist()
    X_train = X_train.drop(columns=all_nan_cols, errors="ignore")
    X_test  = X_test.drop(columns=all_nan_cols,  errors="ignore")

    # ── IMPUTE ────────────────────────────────────────────
    imputer      = SimpleImputer(strategy="median")
    X_train_imp  = imputer.fit_transform(X_train)  # DataFrame → populates feature_names_in_
    X_test_imp   = imputer.transform(X_test)

    imputer_cols = list(imputer.feature_names_in_)

    # ── DROP ZERO-VARIANCE COLUMNS ────────────────────────
    variances         = X_train_imp.var(axis=0)
    non_zero_var_mask = variances > 0

    if non_zero_var_mask.sum() == 0:
        return {"status": "error", "message": "All features have zero variance after imputation."}

    X_train_imp = X_train_imp[:, non_zero_var_mask]
    X_test_imp  = X_test_imp[:, non_zero_var_mask]

    # ── SCALE ─────────────────────────────────────────────
    scaler      = StandardScaler()
    X_train_s   = scaler.fit_transform(X_train_imp)
    X_test_s    = scaler.transform(X_test_imp)

    # ── FINAL NaN GUARD ───────────────────────────────────
    X_train_s = np.nan_to_num(X_train_s, nan=0.0, posinf=0.0, neginf=0.0)
    X_test_s  = np.nan_to_num(X_test_s,  nan=0.0, posinf=0.0, neginf=0.0)

    # ── CLASS CHECK ───────────────────────────────────────
    if y_train.nunique() < 2:
        return {"status": "error", "message": "Training data has only one class — cannot train."}

    # ── MODEL ─────────────────────────────────────────────
    model = LogisticRegression(
        max_iter=1000, class_weight="balanced", solver="lbfgs"
    )
    model.fit(X_train_s, y_train)

    probs = model.predict_proba(X_test_s)[:, 1]
    preds = (probs >= 0.5).astype(int)

    # ── METRICS ───────────────────────────────────────────
    accuracy  = accuracy_score(y_test, preds)
    precision = precision_score(y_test, preds, zero_division=0)
    recall    = recall_score(y_test, preds, zero_division=0)
    f1        = f1_score(y_test, preds, zero_division=0)
    auc       = roc_auc_score(y_test, probs) if y_test.nunique() > 1 else 0.0
    tn, fp, fn, tp = confusion_matrix(y_test, preds).ravel()

    kept_features = X_train.columns[non_zero_var_mask].tolist()

    # ── SAVE ARTIFACTS ────────────────────────────────────
    joblib.dump(model,         MODEL_PATH)
    joblib.dump(kept_features, FEATURES_PATH)
    joblib.dump(scaler,        SCALER_PATH)
    joblib.dump(imputer,       IMPUTER_PATH)
    joblib.dump(all_nan_cols,  ALLNAN_PATH)

    metrics = {
        "accuracy":  round(accuracy  * 100, 2),
        "precision": round(precision * 100, 2),
        "recall":    round(recall    * 100, 2),
        "f1":        round(f1        * 100, 2),
        "auc":       round(auc       * 100, 2),
    }

    # ── SAVE SCHEMA TO DB ─────────────────────────────────
    save_schema_to_db(
        db            = db,
        metrics       = metrics,
        feature_names = kept_features,
        imputer_cols  = imputer_cols,
        all_nan_cols  = all_nan_cols,
        raw_columns   = raw_columns,
    )

    logger.info(f"Training complete. Features used: {len(kept_features)}")

    return {
        "status":  "success",
        "metrics": metrics,
        "confusion_matrix": {
            "tn": int(tn), "fp": int(fp),
            "fn": int(fn), "tp": int(tp),
        },
    }