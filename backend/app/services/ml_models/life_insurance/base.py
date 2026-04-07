import pandas as pd
import numpy as np

def basic_cleaning(df: pd.DataFrame):
    df = df.copy()

    # Drop obvious leakage / useless columns
    drop_cols = [
        "id", "policy_number", "mobile_number",
        "created_at", "updated_at"
    ]

    df = df.drop(columns=[c for c in drop_cols if c in df.columns], errors="ignore")

    return df


def create_target(df: pd.DataFrame):
    """
    Define retention:
    1 = retained (Paid up)
    0 = not retained (Lapse, Due, Discontinue)
    """
    df = df.copy()

    df["target"] = df["policy_status"].apply(
        lambda x: 1 if str(x).lower() == "paid up" else 0
    )

    return df


def feature_engineering(df: pd.DataFrame):
    df = df.copy()

    # Example: premium ratio
    if "outstanding_premium" in df.columns:
        df["premium_bucket"] = pd.cut(
            df["outstanding_premium"],
            bins=[0, 10000, 50000, 100000, 500000, np.inf],
            labels=["very_low", "low", "medium", "high", "very_high"]
        )

    # Example: month extraction
    if "dataset_month" in df.columns:
        df["dataset_month"] = pd.to_datetime(df["dataset_month"])
        df["month"] = df["dataset_month"].dt.month

    return df


def split_train_test(df: pd.DataFrame):
    """
    Time-based split (VERY IMPORTANT)
    """
    df = df.sort_values("dataset_month")

    train = df[df["dataset_month"] < df["dataset_month"].max()]
    test = df[df["dataset_month"] == df["dataset_month"].max()]

    return train, test