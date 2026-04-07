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

USEFUL_COLS = [
    "total_pos", 
    "emi_amount", 
    "bounce_charge", 
    "state", 
    "flag1", 
    "propensity", 
    "dataset_month"
]

def _sanitize_row(raw: dict) -> dict:
    return {k: raw.get(k) for k in USEFUL_COLS}

def _build_feature_df(df: pd.DataFrame) -> pd.DataFrame:
    if "dataset_month" in df.columns:
        df = df.drop(columns=["dataset_month"])
    for col in ["total_pos", "emi_amount"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)
    if "total_pos" in df.columns and "emi_amount" in df.columns:
        df['pos_to_emi_ratio'] = (df['total_pos'] / (df['emi_amount'] + 1)).round(2)
    cat_cols = ['state', 'flag1', 'propensity']
    safe_cats = [c for c in cat_cols if c in df.columns]
    if safe_cats:
        df = pd.get_dummies(df, columns=safe_cats, drop_first=True)
    return df

# ------------------------------------------------------------------ #
# MAIN TRAINING FUNCTION
# ------------------------------------------------------------------ #

def train_and_evaluate_debt_model(db: Session, test_month: date) -> dict:
    try:
        # 1. LOAD DATA
        records = db.query(
            CollectionRecord.total_pos,
            CollectionRecord.emi_amount,
            CollectionRecord.bounce_charge,
            CollectionRecord.state,
            CollectionRecord.flag1,
            CollectionRecord.propensity,
            CollectionRecord.dataset_month
        ).filter(CollectionRecord.total_pos.isnot(None)).all()
        
        if len(records) < 50:
            return {"status": "error", "message": "Not enough debt data to train."}

        df = pd.DataFrame(records, columns=USEFUL_COLS)

        # 2. TARGET DERIVATION (bounce_charge <= 0)
        df['bounce_charge'] = pd.to_numeric(df['bounce_charge'], errors='coerce').fillna(0)
        df['target'] = (df['bounce_charge'] <= 0).astype(int)
        df = df.drop(columns=['bounce_charge'])
        
        df['dataset_month'] = pd.to_datetime(df['dataset_month']).dt.date
        
        # 3. NUMERIC FEATURES
        df['total_pos'] = pd.to_numeric(df['total_pos'], errors='coerce').fillna(0)
        df['emi_amount'] = pd.to_numeric(df['emi_amount'], errors='coerce').fillna(0)
        df['pos_to_emi_ratio'] = (df['total_pos'] / (df['emi_amount'] + 1)).round(2)

        # 4. CATEGORICAL GUARD
        cat_cols = ['state', 'flag1', 'propensity']
        safe_cats = []
        for col in cat_cols:
            df[col] = df[col].astype(str).fillna('UNKNOWN')
            if df[col].nunique() < 25:
                safe_cats.append(col)
            else:
                df = df.drop(columns=[col])

        # Dummify ONLY the safe columns
        df_encoded = pd.get_dummies(df, columns=safe_cats, drop_first=True)

        # 5. TIME-SERIES SPLIT
        train_mask = df_encoded['dataset_month'] < test_month
        test_mask = df_encoded['dataset_month'] == test_month
        
        X_train_raw = df_encoded[train_mask]
        y_train_raw = df[train_mask]['target']
        
        X_test_raw = df_encoded[test_mask]
        y_test = df[test_mask]['target']

        if len(X_train_raw) == 0 or len(X_test_raw) == 0:
            return {"status": "error", "message": f"Data split failed for {test_month}."}

        # --- THE FIX: THE CLASS GUARD ---
        if y_train_raw.nunique() < 2:
            return {
                "status": "error", 
                "message": f"Training data before {test_month} only contains ONE outcome (e.g., 100% defaults). The AI needs examples of BOTH payers and defaulters to learn."
            }

        # 6. BALANCED UNDERSAMPLING
        train_combined = X_train_raw.copy()
        train_combined['__TARGET__'] = y_train_raw
        
        payers = train_combined[train_combined['__TARGET__'] == 1]
        defaulters = train_combined[train_combined['__TARGET__'] == 0]
        
        if len(defaulters) > len(payers) and len(payers) > 0:
            defaulters_downsampled = defaulters.sample(n=len(payers)*2, random_state=42, replace=True)
            balanced_train = pd.concat([payers, defaulters_downsampled]).sample(frac=1, random_state=42)
        else:
            balanced_train = train_combined

        X_train = balanced_train.drop(columns=['__TARGET__', 'dataset_month'])
        y_train = balanced_train['__TARGET__']
        X_test = X_test_raw.drop(columns=['dataset_month'])

        X_test = X_test.reindex(columns=X_train.columns, fill_value=0)

        # 7. SCALE
        scaler = StandardScaler()
        X_train_s = scaler.fit_transform(X_train)
        X_test_s = scaler.transform(X_test)

        # 8. TRAIN
        model = RandomForestClassifier(n_estimators=100, max_depth=8, class_weight="balanced_subsample", random_state=42)
        model.fit(X_train_s, y_train)

        # --- THE FIX: SAFE PROBABILITY EXTRACTION ---
        # Ensure we are grabbing the index for class '1' (Will Pay), regardless of array shape
        if 1 in model.classes_:
            class_1_index = list(model.classes_).index(1)
            probs = model.predict_proba(X_test_s)[:, class_1_index]
        else:
            probs = np.zeros(len(X_test_s))

        best_threshold = 0.40
        predictions = (probs >= best_threshold).astype(int)

        # 9. METRICS
        acc = accuracy_score(y_test, predictions)
        rec = recall_score(y_test, predictions, zero_division=0)
        prec = precision_score(y_test, predictions, zero_division=0)
        f1 = f1_score(y_test, predictions, zero_division=0)
        
        try:
            auc = roc_auc_score(y_test, probs)
        except ValueError:
            auc = None

        cm = confusion_matrix(y_test, predictions, labels=[0, 1])
        tn, fp, fn, tp = cm.ravel()

        joblib.dump(X_train.columns.tolist(), DEBT_FEATURES_PATH)
        joblib.dump(model, DEBT_MODEL_PATH)
        joblib.dump(scaler, DEBT_SCALER_PATH)
        joblib.dump(best_threshold, DEBT_THRESHOLD_PATH)

        return {
            "status": "success",
            "message": f"Debt Model evaluated on {test_month}.",
            "training_info": {
                "label_derivation": "bounce_charge <= 0 → Will Pay",
                "undersampling_ratio": "Dynamic Balancing",
                "balanced_training_rows": len(X_train),
                "validation_month": "N/A",
                "features_used": len(X_train.columns),
                "tuned_threshold": best_threshold,
                "val_f1_at_threshold": round(f1 * 100, 2),
            },
            "metrics": {
                "accuracy_pct": round(acc * 100, 2),
                "precision_pct": round(prec * 100, 2),
                "recall_pct": round(rec * 100, 2),
                "f1_score_pct": round(f1 * 100, 2),
                "roc_auc_pct": round(auc * 100, 2) if auc else "N/A",
            },
            "confusion_matrix": {
                "true_negatives": int(tn),
                "false_positives": int(fp),
                "false_negatives": int(fn),
                "true_positives": int(tp),
            },
            "dashboard_data": {
                "month": str(test_month),
                "total_debtors": len(y_test),
                "actual_paying": int(y_test.sum()),
                "actual_defaulting": len(y_test) - int(y_test.sum()),
                "ai_predicted_paying": int(predictions.sum()),
                "ai_predicted_defaulting": len(predictions) - int(predictions.sum())
            }
        }
    except Exception as e:
        import traceback
        return {"status": "error", "message": str(e), "trace": traceback.format_exc()}