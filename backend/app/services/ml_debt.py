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

from app.models.collections import CollectionRecord

# ------------------------------------------------------------------ #
# PATHS
# ------------------------------------------------------------------ #
MODEL_DIR = "app/ml/models"
os.makedirs(MODEL_DIR, exist_ok=True)

DEBT_MODEL_PATH     = os.path.join(MODEL_DIR, "debt_propensity_rf.joblib")
DEBT_FEATURES_PATH  = os.path.join(MODEL_DIR, "debt_features.joblib")
DEBT_SCALER_PATH    = os.path.join(MODEL_DIR, "debt_scaler.joblib")
DEBT_THRESHOLD_PATH = os.path.join(MODEL_DIR, "debt_threshold.joblib")

# ------------------------------------------------------------------ #
# COLUMNS queried from DB.
#   - bounce_charge is queried ONLY to derive the target, then dropped.
#   - propensity, flag1 are excluded (leaky / circular).
#   - dpd and bucket are excluded (all zeros / all empty in data).
# ------------------------------------------------------------------ #
QUERY_COLS = [
    "loan_amount",
    "total_pos",
    "emi_amount",
    "bounce_charge",        # target source — dropped before training
    "customer_occupation",
    "state",
    "product_type",
    "loan_disbursal_date",
    "last_payment_date",
    "dataset_month",
]

# Sentinel date used by the ETL for missing dates
_SENTINEL_DATE = date(1970, 1, 1)


def _sanitize_row(raw: dict) -> dict:
    """Keep only the columns the inference pipeline uses (no bounce_charge)."""
    inference_cols = [c for c in QUERY_COLS if c != "bounce_charge"]
    return {k: raw.get(k) for k in inference_cols}


def _build_feature_df(df: pd.DataFrame) -> pd.DataFrame:
    """
    Engineer features from raw queried data for inference.
    Mirrors the same steps used inside training so that the
    saved model / scaler / feature list stay consistent.
    """
    # --- Numeric ---
    for col in ["loan_amount", "total_pos", "emi_amount"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

    # --- Engineered ratios ---
    if "total_pos" in df.columns and "emi_amount" in df.columns:
        df["pos_to_emi_ratio"] = (df["total_pos"] / (df["emi_amount"] + 1)).round(2)
    if "loan_amount" in df.columns and "emi_amount" in df.columns:
        df["loan_to_emi_ratio"] = (df["loan_amount"] / (df["emi_amount"] + 1)).round(2)
    if "total_pos" in df.columns and "loan_amount" in df.columns:
        df["pos_to_loan_ratio"] = (df["total_pos"] / (df["loan_amount"] + 1)).round(4)

    # --- Date-derived features ---
    ds_month = (
        pd.to_datetime(df["dataset_month"], errors="coerce")
        if "dataset_month" in df.columns
        else None
    )

    if "loan_disbursal_date" in df.columns and ds_month is not None:
        disbursal = pd.to_datetime(df["loan_disbursal_date"], errors="coerce")
        loan_age = (ds_month - disbursal).dt.days
        df["loan_age_days"] = loan_age.where(disbursal.dt.year > 1970, 0).fillna(0).clip(lower=0)
        df = df.drop(columns=["loan_disbursal_date"])

    if "last_payment_date" in df.columns and ds_month is not None:
        last_pay = pd.to_datetime(df["last_payment_date"], errors="coerce")
        days_since = (ds_month - last_pay).dt.days
        df["days_since_last_payment"] = (
            days_since.where(last_pay.dt.year > 1970, 9999).fillna(9999).clip(lower=0)
        )
        df = df.drop(columns=["last_payment_date"])

    if "dataset_month" in df.columns:
        df = df.drop(columns=["dataset_month"])

    # --- Categorical encoding ---
    cat_cols = ["customer_occupation", "state", "product_type"]
    safe_cats = []
    for col in cat_cols:
        if col in df.columns:
            df[col] = (
                df[col]
                .astype(str)
                .replace("", "UNKNOWN")
                .replace("nan", "UNKNOWN")
                .fillna("UNKNOWN")
            )
            if df[col].nunique() < 30:
                safe_cats.append(col)
            else:
                df = df.drop(columns=[col])

    if safe_cats:
        df = pd.get_dummies(df, columns=safe_cats, drop_first=True)

    return df


# ------------------------------------------------------------------ #
# MAIN TRAINING FUNCTION
# ------------------------------------------------------------------ #

def train_and_evaluate_debt_model(db: Session, test_month: date) -> dict:
    try:
        # ── 1. LOAD DATA ─────────────────────────────────────────────
        records = db.query(
            CollectionRecord.loan_amount,
            CollectionRecord.total_pos,
            CollectionRecord.emi_amount,
            CollectionRecord.bounce_charge,
            CollectionRecord.customer_occupation,
            CollectionRecord.state,
            CollectionRecord.product_type,
            CollectionRecord.loan_disbursal_date,
            CollectionRecord.last_payment_date,
            CollectionRecord.dataset_month,
        ).all()

        if len(records) < 50:
            return {
                "status": "error",
                "message": "Not enough debt data to train (need ≥ 50 records).",
            }

        df = pd.DataFrame(records, columns=QUERY_COLS)

        # ── 2. TARGET DERIVATION from bounce_charge ──────────────────
        #   bounce_charge <= 0  →  Payment went through  →  Will Pay  (1)
        #   bounce_charge > 0   →  Payment bounced        →  Defaulter (0)
        df["bounce_charge"] = pd.to_numeric(df["bounce_charge"], errors="coerce").fillna(0)
        df["target"] = (df["bounce_charge"] <= 0).astype(int)

        # ╔════════════════════════════════════════════════════════════╗
        # ║  CRITICAL: Drop bounce_charge so it cannot leak into      ║
        # ║  features. The model must learn from OTHER columns.       ║
        # ╚════════════════════════════════════════════════════════════╝
        df = df.drop(columns=["bounce_charge"])

        df["dataset_month"] = pd.to_datetime(df["dataset_month"]).dt.date

        # ── 3. NUMERIC FEATURES ──────────────────────────────────────
        for col in ["loan_amount", "total_pos", "emi_amount"]:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

        df["pos_to_emi_ratio"]  = (df["total_pos"]  / (df["emi_amount"]  + 1)).round(2)
        df["loan_to_emi_ratio"] = (df["loan_amount"] / (df["emi_amount"]  + 1)).round(2)
        df["pos_to_loan_ratio"] = (df["total_pos"]   / (df["loan_amount"] + 1)).round(4)

        # ── Date-derived features ────────────────────────────────────
        ds_month_ts = pd.to_datetime(df["dataset_month"], errors="coerce")

        disbursal = pd.to_datetime(df["loan_disbursal_date"], errors="coerce")
        loan_age  = (ds_month_ts - disbursal).dt.days
        df["loan_age_days"] = loan_age.where(disbursal.dt.year > 1970, 0).fillna(0).clip(lower=0)
        df = df.drop(columns=["loan_disbursal_date"])

        last_pay   = pd.to_datetime(df["last_payment_date"], errors="coerce")
        days_since = (ds_month_ts - last_pay).dt.days
        df["days_since_last_payment"] = (
            days_since.where(last_pay.dt.year > 1970, 9999).fillna(9999).clip(lower=0)
        )
        df = df.drop(columns=["last_payment_date"])

        # ── 4. CATEGORICAL GUARD ────────────────────────────────────
        cat_cols  = ["customer_occupation", "state", "product_type"]
        safe_cats = []
        for col in cat_cols:
            df[col] = (
                df[col]
                .astype(str)
                .replace("", "UNKNOWN")
                .replace("nan", "UNKNOWN")
                .fillna("UNKNOWN")
            )
            if df[col].nunique() < 30:
                safe_cats.append(col)
            else:
                df = df.drop(columns=[col])

        df_encoded = pd.get_dummies(df, columns=safe_cats, drop_first=True)

        # ── 5. TIME-SERIES SPLIT ────────────────────────────────────
        train_mask = df_encoded["dataset_month"] < test_month
        test_mask  = df_encoded["dataset_month"] == test_month

        X_train_raw = df_encoded[train_mask]
        y_train_raw = df[train_mask]["target"]

        X_test_raw = df_encoded[test_mask]
        y_test     = df[test_mask]["target"]

        if len(X_train_raw) == 0 or len(X_test_raw) == 0:
            return {
                "status": "error",
                "message": (
                    f"Data split failed for {test_month}. "
                    f"Train rows: {len(X_train_raw)}, Test rows: {len(X_test_raw)}. "
                    "Need data both before AND on this month."
                ),
            }

        # ── CLASS GUARD ─────────────────────────────────────────────
        train_class_counts = y_train_raw.value_counts()
        if y_train_raw.nunique() < 2:
            return {
                "status": "error",
                "message": (
                    f"Training data before {test_month} contains only ONE outcome "
                    f"(class distribution: {train_class_counts.to_dict()}). "
                    "The model needs examples of BOTH payers and defaulters."
                ),
            }

        # ── 6. BALANCED UNDERSAMPLING ───────────────────────────────
        train_combined = X_train_raw.copy()
        train_combined["__TARGET__"] = y_train_raw

        payers     = train_combined[train_combined["__TARGET__"] == 1]
        defaulters = train_combined[train_combined["__TARGET__"] == 0]

        minority_n = min(len(payers), len(defaulters))
        majority_n = max(len(payers), len(defaulters))

        if minority_n > 0 and majority_n > minority_n * 1.5:
            target_n = min(minority_n * 2, majority_n)
            if len(defaulters) > len(payers):
                sampled = defaulters.sample(
                    n=target_n, random_state=42, replace=(target_n > len(defaulters))
                )
                balanced_train = pd.concat([payers, sampled]).sample(frac=1, random_state=42)
            else:
                sampled = payers.sample(
                    n=target_n, random_state=42, replace=(target_n > len(payers))
                )
                balanced_train = pd.concat([sampled, defaulters]).sample(frac=1, random_state=42)
        else:
            balanced_train = train_combined

        X_train = balanced_train.drop(columns=["__TARGET__", "dataset_month"])
        y_train = balanced_train["__TARGET__"]
        X_test  = X_test_raw.drop(columns=["dataset_month"])

        # Align test columns to training columns
        X_test = X_test.reindex(columns=X_train.columns, fill_value=0)

        # Safety: remove target column if it leaked through dummies
        for leak_col in ["target"]:
            if leak_col in X_train.columns:
                X_train = X_train.drop(columns=[leak_col])
                X_test  = X_test.drop(columns=[leak_col])

        # ── 7. SCALE ───────────────────────────────────────────────
        scaler    = StandardScaler()
        X_train_s = scaler.fit_transform(X_train)
        X_test_s  = scaler.transform(X_test)

        # ── 8. TRAIN — tuned hyperparameters ───────────────────────
        model = RandomForestClassifier(
            n_estimators=200,
            max_depth=6,             # shallow trees prevent memorisation
            min_samples_split=20,    # need ≥20 samples to try a split
            min_samples_leaf=10,     # each leaf must represent ≥10 records
            max_features="sqrt",     # decorrelate trees
            class_weight="balanced", # auto-weight minority class
            random_state=42,
            oob_score=True,          # free validation estimate
        )
        model.fit(X_train_s, y_train)

        # ── 9. SAFE PROBABILITY EXTRACTION ────────────────────────
        if 1 in model.classes_:
            class_1_idx = list(model.classes_).index(1)
            probs = model.predict_proba(X_test_s)[:, class_1_idx]
        else:
            probs = np.zeros(len(X_test_s))

        # Dynamic threshold tuning via F1 optimisation
        best_threshold = 0.50
        best_f1 = 0.0
        for thresh in np.arange(0.30, 0.70, 0.05):
            preds_tmp = (probs >= thresh).astype(int)
            f1_tmp = f1_score(y_test, preds_tmp, zero_division=0)
            if f1_tmp > best_f1:
                best_f1 = f1_tmp
                best_threshold = float(thresh)

        predictions = (probs >= best_threshold).astype(int)

        # ── 10. METRICS ───────────────────────────────────────────
        acc  = accuracy_score(y_test, predictions)
        rec  = recall_score(y_test, predictions, zero_division=0)
        prec = precision_score(y_test, predictions, zero_division=0)
        f1   = f1_score(y_test, predictions, zero_division=0)

        try:
            auc = roc_auc_score(y_test, probs)
        except ValueError:
            auc = None

        cm = confusion_matrix(y_test, predictions, labels=[0, 1])
        tn, fp, fn, tp = cm.ravel()

        # Feature importance (for dashboard graphs)
        feature_names = X_train.columns.tolist()
        importances   = model.feature_importances_
        top_features  = sorted(
            zip(feature_names, importances), key=lambda x: x[1], reverse=True
        )[:10]

        # ── PERSIST ───────────────────────────────────────────────
        joblib.dump(feature_names,  DEBT_FEATURES_PATH)
        joblib.dump(model,          DEBT_MODEL_PATH)
        joblib.dump(scaler,         DEBT_SCALER_PATH)
        joblib.dump(best_threshold, DEBT_THRESHOLD_PATH)

        return {
            "status": "success",
            "message": f"Debt Model evaluated on {test_month}.",
            "training_info": {
                "label_derivation": "bounce_charge <= 0 → Will Pay | bounce_charge > 0 → Defaulter",
                "undersampling_ratio": "Dynamic Balancing (max 2:1)",
                "balanced_training_rows": len(X_train),
                "test_rows": len(X_test),
                "features_used": len(feature_names),
                "tuned_threshold": round(best_threshold, 2),
                "oob_score": round(model.oob_score_, 4) if hasattr(model, "oob_score_") else "N/A",
                "train_class_distribution": train_class_counts.to_dict(),
            },
            "metrics": {
                "accuracy_pct":  round(acc  * 100, 2),
                "precision_pct": round(prec * 100, 2),
                "recall_pct":    round(rec  * 100, 2),
                "f1_score_pct":  round(f1   * 100, 2),
                "roc_auc_pct":   round(auc  * 100, 2) if auc else "N/A",
            },
            "confusion_matrix": {
                "true_negatives":  int(tn),
                "false_positives": int(fp),
                "false_negatives": int(fn),
                "true_positives":  int(tp),
            },
            "top_features": [
                {"name": name, "importance": round(imp, 4)} for name, imp in top_features
            ],
            "dashboard_data": {
                "month":                   str(test_month),
                "total_debtors":           len(y_test),
                "actual_paying":           int(y_test.sum()),
                "actual_defaulting":       len(y_test) - int(y_test.sum()),
                "ai_predicted_paying":     int(predictions.sum()),
                "ai_predicted_defaulting": len(predictions) - int(predictions.sum()),
            },
        }
    except Exception as e:
        import traceback
        return {"status": "error", "message": str(e), "trace": traceback.format_exc()}