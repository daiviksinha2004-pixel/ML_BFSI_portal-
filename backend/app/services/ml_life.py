import pandas as pd
import numpy as np
import os
import joblib
from datetime import date
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score,
    f1_score, roc_auc_score, confusion_matrix,
)
from sklearn.preprocessing import StandardScaler
from sqlalchemy.orm import Session

from app.models.insurance import LifeCampaignRecord

# ------------------------------------------------------------------ #
# PATHS
# ------------------------------------------------------------------ #
MODEL_DIR = "app/ml/models"
os.makedirs(MODEL_DIR, exist_ok=True)

LIFE_MODEL_PATH     = os.path.join(MODEL_DIR, "life_propensity_rf.joblib")
LIFE_FEATURES_PATH  = os.path.join(MODEL_DIR, "life_features.joblib")
LIFE_SCALER_PATH    = os.path.join(MODEL_DIR, "life_scaler.joblib")
LIFE_THRESHOLD_PATH = os.path.join(MODEL_DIR, "life_threshold.joblib")


# ------------------------------------------------------------------ #
# COLUMN CONFIG — tuned to life_campaign_records actual schema
#
# From your data dump the visible columns are:
#   id, org_id(?), branch_id(?), product_id(?), customer_id,
#   policy_number, mobile_number, [empty], policy_status,
#   [many empties], outstanding_premium, [empties], segment_code,
#   [empties], pmt_flag, dataset_month, [empty], created_at
#
# IMPORTANT: if your SQLAlchemy model uses different attribute names
# (e.g. "segment" instead of "segment_code") update SEGMENT_COL below.
# ------------------------------------------------------------------ #

SEGMENT_COL = "segment_code"   # Change to match your ORM field name

# All columns that must NEVER reach the model
ALWAYS_DROP = {
    "id", "customer_id", "customer_name",
    "phone_number", "mobile_number",
    "email", "policy_number",
    "created_at", "updated_at",
    "pmt_flag",           # TARGET
    "policy_status",      # post-decision label → leakage
    "status",
    "payment_date",
    "dataset_month",      # used for split, not a feature
}


def _sanitize_row(raw: dict) -> dict:
    """
    Flatten any nested dict / list values so pandas and get_dummies
    never encounter unhashable types.
    """
    import json
    clean = {}
    for k, v in raw.items():
        if isinstance(v, dict):
            clean[k] = json.dumps(v, sort_keys=True)
        elif isinstance(v, list):
            clean[k] = "|".join(str(i) for i in v)
        elif v is None:
            clean[k] = np.nan
        else:
            clean[k] = v
    return clean


def _build_feature_df(df: pd.DataFrame) -> pd.DataFrame:
    """
    From the raw DataFrame build a clean, encoded feature matrix.
    dataset_month is preserved as a column so the caller can do
    time-based splits, then dropped before training.
    """
    # Drop leakage / ID columns
    to_drop = [c for c in ALWAYS_DROP if c in df.columns and c != "dataset_month"]
    X = df.drop(columns=to_drop, errors="ignore")

    # Coerce outstanding_premium
    if "outstanding_premium" in X.columns:
        X["outstanding_premium"] = pd.to_numeric(
            X["outstanding_premium"], errors="coerce"
        ).fillna(0)

    # Detect types
    num_cols = X.select_dtypes(include=["number"]).columns.tolist()
    cat_cols = X.select_dtypes(
        include=["object", "string", "category"]
    ).columns.tolist()
    bool_cols = X.select_dtypes(include=["bool"]).columns.tolist()

    # Convert booleans to int (0/1)
    for c in bool_cols:
        X[c] = X[c].astype(int)
        if c not in num_cols:
            num_cols.append(c)

    # Exclude dataset_month from auto-detection (it's kept as a date object)
    for col_list in (num_cols, cat_cols):
        if "dataset_month" in col_list:
            col_list.remove("dataset_month")

    # Cardinality guard — drop high-cardinality categoricals
    safe_cat = [c for c in cat_cols if 0 < X[c].nunique() < 20]

    # Fill numeric NaNs with median
    for c in num_cols:
        med = X[c].median()
        X[c] = X[c].fillna(med if not np.isnan(med) else 0)

    # Keep only useful columns + dataset_month
    keep = num_cols + safe_cat + (["dataset_month"] if "dataset_month" in X.columns else [])
    X = X[keep]

    # One-hot encode
    if safe_cat:
        X = pd.get_dummies(X, columns=safe_cat, drop_first=True, dummy_na=True)

    return X


def train_and_evaluate_life_model(db: Session, test_month: date) -> dict:
    """
    Train and evaluate the Life Insurance propensity model.

    Split strategy  : time-series (train < test_month, eval == test_month)
    Imbalance fix   : 3:1 majority undersampling (replace=False) + class_weight='balanced'
    Threshold       : F1-optimised on last training month (validation fold)
    Saved artifacts : model, feature list, scaler, threshold
    """

    # ------------------------------------------------------------------ #
    # 1. LOAD DATA
    # ------------------------------------------------------------------ #
    records = (
        db.query(LifeCampaignRecord)
        .filter(LifeCampaignRecord.outstanding_premium.isnot(None))
        .all()
    )
    if len(records) < 50:
        return {"status": "error", "message": "Not enough data to train (need ≥ 50 rows)."}

    rows = []
    for r in records:
        raw = r.__dict__.copy()
        raw.pop("_sa_instance_state", None)
        rows.append(_sanitize_row(raw))

    df = pd.DataFrame(rows)

    # Normalise target  (DB stores bool True/False)
    df["pmt_flag"] = (
        df["pmt_flag"]
        .map({True: 1, False: 0, "true": 1, "false": 0,
              "True": 1, "False": 0, 1: 1, 0: 0})
        .fillna(0)
        .astype(int)
    )

    # Parse dataset_month to date
    df["dataset_month"] = pd.to_datetime(df["dataset_month"], errors="coerce").dt.date
    df = df.dropna(subset=["dataset_month"])

    # ------------------------------------------------------------------ #
    # 2. BUILD FEATURE MATRIX
    # ------------------------------------------------------------------ #
    y = df["pmt_flag"].copy()
    y.index = range(len(y))
    df.index = range(len(df))

    X_enc = _build_feature_df(df)   # still contains dataset_month column
    X_enc.index = range(len(X_enc))

    # ------------------------------------------------------------------ #
    # 3. TIME-SERIES SPLIT
    # ------------------------------------------------------------------ #
    train_mask = X_enc["dataset_month"] < test_month
    test_mask  = X_enc["dataset_month"] == test_month

    if train_mask.sum() == 0:
        return {"status": "error",
                "message": f"No training data before {test_month}."}
    if test_mask.sum() == 0:
        return {"status": "error",
                "message": f"No test data for {test_month}. Ensure records exist for that month."}

    X_train_full = X_enc[train_mask].copy()
    y_train_full = y[train_mask].copy()
    X_test_full  = X_enc[test_mask].copy()
    y_test       = y[test_mask].copy()

    # Carve validation fold from last training month
    all_train_months = sorted(X_train_full["dataset_month"].unique())
    last_train_month = all_train_months[-1]

    if len(all_train_months) > 1:
        val_mask  = X_train_full["dataset_month"] == last_train_month
        X_val_f   = X_train_full[val_mask].copy()
        y_val     = y_train_full[val_mask].copy()
        X_train_full = X_train_full[~val_mask].copy()
        y_train_full = y_train_full[~val_mask].copy()
    else:
        from sklearn.model_selection import train_test_split
        X_train_full, X_val_f, y_train_full, y_val = train_test_split(
            X_train_full, y_train_full,
            test_size=0.20, random_state=42,
            stratify=y_train_full,
        )

    # Drop dataset_month — not a feature
    for frame in (X_train_full, X_val_f, X_test_full):
        if "dataset_month" in frame.columns:
            frame.drop(columns=["dataset_month"], inplace=True)

    # ------------------------------------------------------------------ #
    # 4. UNDERSAMPLING  (replace=False)
    # ------------------------------------------------------------------ #
    train_df = X_train_full.copy()
    train_df["__TARGET__"] = y_train_full.values

    minority = train_df[train_df["__TARGET__"] == 1]
    majority = train_df[train_df["__TARGET__"] == 0]
    n_min, n_maj = len(minority), len(majority)

    if n_min == 0:
        return {"status": "error",
                "message": "Zero pmt_flag=1 rows in training data. Cannot train."}

    if n_maj > n_min:
        n_sample = min(n_min * 3, n_maj)
        maj_down = majority.sample(n=n_sample, random_state=42, replace=False)
        balanced = pd.concat([maj_down, minority]).sample(frac=1, random_state=42)
    else:
        balanced = train_df.copy()

    X_train = balanced.drop(columns=["__TARGET__"])
    y_train = balanced["__TARGET__"]

    # Align val / test to training columns
    X_val  = X_val_f.reindex(columns=X_train.columns,  fill_value=0)
    X_test = X_test_full.reindex(columns=X_train.columns, fill_value=0)

    # ------------------------------------------------------------------ #
    # 5. SCALE
    # ------------------------------------------------------------------ #
    scaler    = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_val_s   = scaler.transform(X_val)
    X_test_s  = scaler.transform(X_test)

    # ------------------------------------------------------------------ #
    # 6. TRAIN
    # ------------------------------------------------------------------ #
    model = RandomForestClassifier(
        n_estimators=200,
        max_depth=8,
        min_samples_leaf=20,
        max_features="sqrt",
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )
    model.fit(X_train_s, y_train)

    # ------------------------------------------------------------------ #
    # 7. THRESHOLD TUNING ON VALIDATION SET
    # ------------------------------------------------------------------ #
    val_probs = model.predict_proba(X_val_s)[:, 1]
    best_threshold, best_f1 = 0.50, 0.0

    for thresh in np.arange(0.20, 0.81, 0.01):
        preds = (val_probs >= thresh).astype(int)
        if preds.sum() == 0:
            continue
        score = f1_score(y_val, preds, zero_division=0)
        if score > best_f1:
            best_f1, best_threshold = score, round(float(thresh), 2)

    # ------------------------------------------------------------------ #
    # 8. EVALUATE ON TEST MONTH
    # ------------------------------------------------------------------ #
    test_probs  = model.predict_proba(X_test_s)[:, 1]
    predictions = (test_probs >= best_threshold).astype(int)

    accuracy  = accuracy_score(y_test, predictions)
    precision = precision_score(y_test, predictions, zero_division=0)
    recall    = recall_score(y_test, predictions, zero_division=0)
    f1_val    = f1_score(y_test, predictions, zero_division=0)
    try:
        auc = roc_auc_score(y_test, test_probs)
    except ValueError:
        auc = None

    cm = confusion_matrix(y_test, predictions, labels=[0, 1])
    tn, fp, fn, tp = cm.ravel()

    # ------------------------------------------------------------------ #
    # 9. SAVE ARTIFACTS
    # ------------------------------------------------------------------ #
    joblib.dump(X_train.columns.tolist(), LIFE_FEATURES_PATH)
    joblib.dump(model,          LIFE_MODEL_PATH)
    joblib.dump(scaler,         LIFE_SCALER_PATH)
    joblib.dump(best_threshold, LIFE_THRESHOLD_PATH)

    total          = len(y_test)
    actual_paid    = int(y_test.sum())
    predicted_paid = int(predictions.sum())

    return {
        "status": "success",
        "message": f"Life model trained and evaluated on {test_month}.",
        "training_info": {
            "undersampling_ratio": "3:1 majority:minority (replace=False)",
            "balanced_training_rows": len(X_train),
            "validation_month": str(last_train_month),
            "features_used": len(X_train.columns),
            "tuned_threshold": best_threshold,
            "val_f1_at_threshold": round(best_f1 * 100, 2),
        },
        "metrics": {
            "accuracy_pct":  round(accuracy  * 100, 2),
            "precision_pct": round(precision * 100, 2),
            "recall_pct":    round(recall    * 100, 2),
            "f1_score_pct":  round(f1_val   * 100, 2),
            "roc_auc_pct":   round(auc * 100, 2) if auc is not None else "N/A",
        },
        "confusion_matrix": {
            "true_negatives":  int(tn),
            "false_positives": int(fp),
            "false_negatives": int(fn),
            "true_positives":  int(tp),
        },
        "dashboard_data": {
            "month":                  str(test_month),
            "total_customers":        total,
            "actual_paid":            actual_paid,
            "actual_defaulted":       total - actual_paid,
            "ai_predicted_paid":      predicted_paid,
            "ai_predicted_defaulted": total - predicted_paid,
        },
    }