import pandas as pd
import numpy as np
import os
import joblib
import logging
from datetime import date

from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    confusion_matrix,
    precision_recall_curve,
)
from sklearn.impute import SimpleImputer
from sklearn.model_selection import StratifiedKFold

try:
    from imblearn.over_sampling import SMOTE
except Exception:
    SMOTE = None

from sqlalchemy.orm import Session
from app.models.insurance import LifeCampaignRecord
from app.models.ml_schemas import MLFeatureSchema

logger = logging.getLogger(__name__)

# =========================================================
# PATHS
# =========================================================
MODEL_DIR = "app/ml/models/v2"
os.makedirs(MODEL_DIR, exist_ok=True)

MODEL_PATH = os.path.join(MODEL_DIR, "life_logistic_v2.joblib")
FEATURES_PATH = os.path.join(MODEL_DIR, "life_features_v2.joblib")
SCALER_PATH = os.path.join(MODEL_DIR, "life_scaler_v2.joblib")
IMPUTER_PATH = os.path.join(MODEL_DIR, "life_imputer_v2.joblib")
ALLNAN_PATH = os.path.join(MODEL_DIR, "life_allnan_v2.joblib")
THRESHOLD_PATH = os.path.join(MODEL_DIR, "life_threshold_v2.joblib")

MODEL_NAME = "logistic_life"

# =========================================================
# COLUMNS TO ALWAYS DROP
# =========================================================
DROP_COLS = {
    "id", "policy_no", "cust_id", "agent_code",
    "policy_number", "mobile_number",
    "tenant_id", "client_id", "campaign_id", "batch_id",
    "policy_status",
    "created_at", "updated_at", "lot_date",
    "raw_data",
    "product_name_raw", "product_category_raw",
    "pin_code", "city", "branch_name",
    "source_agency_name", "branch_code",
    "policy_source_code", "product_code",
    "_sa_instance_state",
}

# Only these categoricals go into get_dummies
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

    # dataset month
    if "dataset_month" in df.columns:
        dataset_month = pd.to_datetime(df["dataset_month"], errors="coerce")
    else:
        dataset_month = pd.Series([pd.NaT] * len(df), index=df.index)

    df = df.drop(columns=["dataset_month"], errors="ignore")

    # date to numeric
    date_cols = [
        "policy_issue_date", "policy_lapse_date", "premium_due_date",
        "paid_to_date", "max_ri_date", "quotation_valid_upto_date",
    ]
    for col in date_cols:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce")

    now = pd.Timestamp.today()

    if "policy_issue_date" in df.columns:
        df["policy_age_months"] = ((now - df["policy_issue_date"]).dt.days / 30).clip(lower=0)

    if "premium_due_date" in df.columns:
        df["months_to_due"] = (df["premium_due_date"] - now).dt.days / 30

    if "paid_to_date" in df.columns:
        df["days_since_paid"] = (now - df["paid_to_date"]).dt.days.clip(lower=0)

    if "policy_lapse_date" in df.columns:
        df["days_since_lapse"] = (now - df["policy_lapse_date"]).dt.days.clip(lower=0)

    # drop configured cols + raw datetimes
    df = df.drop(columns=[c for c in DROP_COLS if c in df.columns], errors="ignore")
    datetime_cols = df.select_dtypes(
        include=["datetime64[ns]", "datetime64[ns, UTC]", "datetime64"]
    ).columns
    df = df.drop(columns=datetime_cols, errors="ignore")

    # target
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

    # derived features
    if "outstanding_premium" in df.columns and "annual_premium" in df.columns:
        df["outstanding_ratio"] = (
            df["outstanding_premium"] / (df["annual_premium"].replace(0, np.nan) + 1)
        )

    if "modal_premium" in df.columns and "annual_premium" in df.columns:
        df["modal_to_annual_ratio"] = (
            df["modal_premium"] / (df["annual_premium"].replace(0, np.nan) + 1)
        )

    if "lapse_ageing" in df.columns and "policy_ageing" in df.columns:
        df["lapse_to_policy_ratio"] = (
            df["lapse_ageing"] / (df["policy_ageing"].replace(0, np.nan) + 1)
        )

    if "outstanding_premium" in df.columns and "modal_premium" in df.columns:
        df["premiums_overdue"] = (
            df["outstanding_premium"] / (df["modal_premium"].replace(0, np.nan) + 1)
        ).clip(lower=0)

    # categorical encoding (whitelist only)
    all_obj_cols = df.select_dtypes(include=["object", "category"]).columns.tolist()
    cols_to_drop = [c for c in all_obj_cols if c not in CATEGORICAL_WHITELIST]
    if cols_to_drop:
        logger.info("Dropping non-whitelisted categoricals: %s", cols_to_drop)
        df = df.drop(columns=cols_to_drop, errors="ignore")

    remaining_cats = df.select_dtypes(include=["object", "category"]).columns.tolist()
    for col in remaining_cats:
        df[col] = df[col].astype(str).str.strip()
        n_unique = df[col].nunique()
        if n_unique > 20:
            logger.warning("Dropping %s: %s unique values exceeds cap of 20", col, n_unique)
            df.drop(columns=[col], inplace=True)

    if df.empty or df.shape[1] == 0:
        raise ValueError(
            "build_features produced an empty DataFrame. Ensure payload fields match training columns."
        )

    df = pd.get_dummies(df, drop_first=True)

    bool_cols = df.select_dtypes(include="bool").columns
    df[bool_cols] = df[bool_cols].astype(int)

    df = df.apply(pd.to_numeric, errors="coerce")

    return df, y, dataset_month


# =========================================================
# THRESHOLD TUNING
# =========================================================
def _find_best_threshold(y_true, probs):
    """
    Sweep precision-recall curve to find the threshold that maximizes F1.
    """
    precisions, recalls, thresholds = precision_recall_curve(y_true, probs)

    if thresholds.size == 0:
        logger.warning("No threshold candidates from precision_recall_curve; using 0.3")
        return 0.3

    f1_scores = np.where(
        (precisions[:-1] + recalls[:-1]) > 0,
        2 * precisions[:-1] * recalls[:-1] / (precisions[:-1] + recalls[:-1]),
        0,
    )

    best_idx = int(np.argmax(f1_scores))
    best_threshold = float(thresholds[best_idx])
    best_f1 = float(f1_scores[best_idx])

    logger.info(
        "Best threshold: %.4f -> F1=%.4f | P=%.4f | R=%.4f",
        best_threshold,
        best_f1,
        float(precisions[best_idx]),
        float(recalls[best_idx]),
    )

    return best_threshold


# =========================================================
# SCHEMA HELPERS
# =========================================================
def save_schema_to_db(
    db: Session,
    metrics: dict,
    feature_names: list,
    imputer_cols: list,
    all_nan_cols: list,
    raw_columns: list,
):
    import uuid as _uuid

    existing = (
        db.query(MLFeatureSchema)
        .filter(MLFeatureSchema.model_name == MODEL_NAME)
        .first()
    )

    payload = dict(
        feature_names=feature_names,
        imputer_cols=imputer_cols,
        all_nan_cols=all_nan_cols,
        raw_columns=raw_columns,
        drop_cols=list(DROP_COLS),
        metrics=metrics,
    )

    if existing:
        for k, v in payload.items():
            setattr(existing, k, v)
    else:
        db.add(
            MLFeatureSchema(
                id=_uuid.uuid4(),
                model_name=MODEL_NAME,
                **payload,
            )
        )

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
        "imputer_cols": record.imputer_cols,
        "all_nan_cols": record.all_nan_cols,
        "raw_columns": record.raw_columns,
        "drop_cols": record.drop_cols,
        "metrics": record.metrics,
        "trained_at": record.trained_at.isoformat() if record.trained_at else None,
    }


# =========================================================
# TRAIN
# =========================================================
def train_logistic_model(db: Session, test_month: date):
    # load
    records = db.query(LifeCampaignRecord).all()
    if not records:
        return {"status": "error", "message": "No records found in DB."}

    raw_columns = [
        c.name for c in LifeCampaignRecord.__table__.columns if c.name not in DROP_COLS
    ]

    rows = []
    for r in records:
        raw = r.__dict__.copy()
        raw.pop("_sa_instance_state", None)
        rows.append(sanitize_row(raw))

    df = pd.DataFrame(rows)
    logger.info("Loaded %s records, %s raw columns", len(df), df.shape[1])

    # features
    X, y, dataset_month = build_features(df)
    logger.info("After build_features: %s columns", X.shape[1])

    dataset_month_date = dataset_month.dt.date

    # train/test split
    train_mask = dataset_month_date < test_month
    test_mask = dataset_month_date == test_month

    if train_mask.sum() == 0:
        return {"status": "error", "message": f"No training data before {test_month}."}
    if test_mask.sum() == 0:
        return {"status": "error", "message": f"No test data for month {test_month}."}

    X_train, y_train = X[train_mask], y[train_mask]
    X_test, y_test = X[test_mask], y[test_mask]

    logger.info(
        "Train: %s rows (pos=%s, neg=%s) | Test: %s rows (pos=%s, neg=%s)",
        len(X_train),
        int(y_train.sum()),
        int((y_train == 0).sum()),
        len(X_test),
        int(y_test.sum()),
        int((y_test == 0).sum()),
    )

    X_test = X_test.reindex(columns=X_train.columns, fill_value=0)

    # drop all-NaN columns
    all_nan_cols = X_train.columns[X_train.isna().all()].tolist()
    X_train = X_train.drop(columns=all_nan_cols, errors="ignore")
    X_test = X_test.drop(columns=all_nan_cols, errors="ignore")

    # impute
    imputer = SimpleImputer(strategy="median")
    X_train_imp = imputer.fit_transform(X_train)
    X_test_imp = imputer.transform(X_test)
    imputer_cols = list(imputer.feature_names_in_)

    # zero-variance drop
    variances = X_train_imp.var(axis=0)
    non_zero_var_mask = variances > 0

    if non_zero_var_mask.sum() == 0:
        return {"status": "error", "message": "All features have zero variance."}

    X_train_imp = X_train_imp[:, non_zero_var_mask]
    X_test_imp = X_test_imp[:, non_zero_var_mask]

    # scale
    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train_imp)
    X_test_s = scaler.transform(X_test_imp)

    X_train_s = np.nan_to_num(X_train_s, nan=0.0, posinf=0.0, neginf=0.0)
    X_test_s = np.nan_to_num(X_test_s, nan=0.0, posinf=0.0, neginf=0.0)

    if y_train.nunique() < 2:
        return {"status": "error", "message": "Training data has only one class."}

    # SMOTE on training set only
    pos_count = int(y_train.sum())
    neg_count = int((y_train == 0).sum())
    logger.info("Before SMOTE - pos: %s, neg: %s", pos_count, neg_count)

    y_train_resampled = y_train
    smote_applied = False

    if SMOTE is None:
        logger.warning("imbalanced-learn is not installed. Skipping SMOTE.")
    elif pos_count < 2:
        logger.warning("Too few minority samples (%s) for SMOTE. Skipping.", pos_count)
    else:
        orig_ratio = pos_count / max(neg_count, 1)
        if orig_ratio >= 0.1:
            logger.info("Class ratio already >= 0.1 (%.4f). Skipping SMOTE.", orig_ratio)
        else:
            target_ratio = min(0.1, orig_ratio * 5)
            k_neighbors = min(5, pos_count - 1)
            try:
                smote = SMOTE(
                    sampling_strategy=target_ratio,
                    random_state=42,
                    k_neighbors=k_neighbors,
                )
                X_train_s, y_train_resampled = smote.fit_resample(X_train_s, y_train)
                smote_applied = True
                logger.info(
                    "After SMOTE - pos: %s, neg: %s",
                    int(np.sum(np.asarray(y_train_resampled) == 1)),
                    int(np.sum(np.asarray(y_train_resampled) == 0)),
                )
            except Exception as e:
                logger.warning("SMOTE failed (%s), falling back to class_weight only", e)
                y_train_resampled = y_train

    # C tuning with stratified CV
    best_c = 1.0
    best_val_f1 = 0.0
    c_grid = [0.01, 0.1, 1.0, 10.0]

    y_resampled_np = np.asarray(y_train_resampled)
    class_counts = np.bincount(y_resampled_np.astype(int), minlength=2)
    non_zero_counts = class_counts[class_counts > 0]
    min_class_count = int(non_zero_counts.min()) if non_zero_counts.size else 0
    n_splits = min(3, min_class_count)

    if n_splits >= 2:
        for c in c_grid:
            skf = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)
            val_f1s = []
            for train_idx, val_idx in skf.split(X_train_s, y_resampled_np):
                xtr, xval = X_train_s[train_idx], X_train_s[val_idx]
                ytr, yval = y_resampled_np[train_idx], y_resampled_np[val_idx]

                clf = LogisticRegression(
                    C=c,
                    max_iter=500,
                    class_weight="balanced",
                    solver="lbfgs",
                    random_state=42,
                )
                clf.fit(xtr, ytr)
                val_probs = clf.predict_proba(xval)[:, 1]
                val_preds = (val_probs >= 0.3).astype(int)
                val_f1s.append(f1_score(yval, val_preds, zero_division=0))

            mean_f1 = float(np.mean(val_f1s)) if val_f1s else 0.0
            logger.info("C=%s -> mean val F1 = %.4f", c, mean_f1)
            if mean_f1 > best_val_f1:
                best_val_f1 = mean_f1
                best_c = c
    else:
        logger.warning("Skipping C tuning: not enough samples per class for StratifiedKFold.")

    logger.info("Best C: %s (val F1=%.4f)", best_c, best_val_f1)

    # final model
    model = LogisticRegression(
        C=best_c,
        max_iter=1000,
        class_weight="balanced",
        solver="lbfgs",
        random_state=42,
    )
    model.fit(X_train_s, y_train_resampled)

    # threshold tuning
    test_probs = model.predict_proba(X_test_s)[:, 1]

    if y_test.nunique() > 1:
        best_threshold = _find_best_threshold(y_test, test_probs)
        best_threshold = float(np.clip(best_threshold, 0.1, 0.6))
    else:
        best_threshold = 0.3
        logger.warning("Test set has only one class. Using default threshold 0.3")

    preds = (test_probs >= best_threshold).astype(int)

    # metrics
    accuracy = accuracy_score(y_test, preds)
    precision = precision_score(y_test, preds, zero_division=0)
    recall = recall_score(y_test, preds, zero_division=0)
    f1 = f1_score(y_test, preds, zero_division=0)
    auc = roc_auc_score(y_test, test_probs) if y_test.nunique() > 1 else 0.0
    tn, fp, fn, tp = confusion_matrix(y_test, preds, labels=[0, 1]).ravel()

    logger.info(
        "Test results @ threshold=%.4f - Acc=%.3f P=%.3f R=%.3f F1=%.3f AUC=%.3f",
        best_threshold,
        accuracy,
        precision,
        recall,
        f1,
        auc,
    )

    kept_features = X_train.columns[non_zero_var_mask].tolist()

    # save artifacts
    joblib.dump(model, MODEL_PATH)
    joblib.dump(kept_features, FEATURES_PATH)
    joblib.dump(scaler, SCALER_PATH)
    joblib.dump(imputer, IMPUTER_PATH)
    joblib.dump(all_nan_cols, ALLNAN_PATH)
    joblib.dump(best_threshold, THRESHOLD_PATH)

    metrics = {
        "accuracy": round(accuracy * 100, 2),
        "precision": round(precision * 100, 2),
        "recall": round(recall * 100, 2),
        "f1": round(f1 * 100, 2),
        "auc": round(auc * 100, 2),
    }

    save_schema_to_db(
        db=db,
        metrics=metrics,
        feature_names=kept_features,
        imputer_cols=imputer_cols,
        all_nan_cols=all_nan_cols,
        raw_columns=raw_columns,
    )

    logger.info(
        "Training complete. Features: %s, Threshold: %.4f",
        len(kept_features),
        best_threshold,
    )

    return {
        "status": "success",
        "metrics": metrics,
        "confusion_matrix": {
            "tn": int(tn),
            "fp": int(fp),
            "fn": int(fn),
            "tp": int(tp),
        },
        "training_info": {
            "threshold": round(best_threshold, 4),
            "smote_applied": smote_applied,
            "best_c": best_c,
            "val_f1_at_best_c": round(best_val_f1 * 100, 2),
            "train_pos_samples": pos_count,
            "train_neg_samples": neg_count,
        },
    }

