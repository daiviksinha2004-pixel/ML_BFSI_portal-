"""
Bucket utility functions for lapse prediction and forecasting.
Configurable bucket logic for policy aging and lapse aging.
"""
from typing import Tuple, List, Dict, Any
from dataclasses import dataclass


@dataclass
class BucketConfig:
    """Configuration for age buckets."""
    name: str
    min_days: int
    max_days: int


# Default policy aging buckets (configurable)
DEFAULT_POLICY_AGING_BUCKETS: List[BucketConfig] = [
    BucketConfig(name="0-1Y", min_days=0, max_days=365),
    BucketConfig(name="1-2Y", min_days=366, max_days=730),
]

# Default lapse aging buckets (configurable)
DEFAULT_LAPSE_AGING_BUCKETS: List[BucketConfig] = [
    BucketConfig(name="0-30", min_days=0, max_days=30),
    BucketConfig(name="31-60", min_days=31, max_days=60),
    BucketConfig(name="61-90", min_days=61, max_days=90),
    BucketConfig(name="91-120", min_days=91, max_days=120),
]


def get_policy_aging_band(days: int, buckets: List[BucketConfig] = None) -> str:
    """
    Get the policy aging band based on number of days.
    
    Args:
        days: Number of days since policy issue
        buckets: List of BucketConfig objects (uses default if None)
    
    Returns:
        Bucket name (e.g., "0-1Y", "1-2Y") or "Unknown" if no match
    """
    if buckets is None:
        buckets = DEFAULT_POLICY_AGING_BUCKETS
    
    for bucket in buckets:
        if bucket.min_days <= days <= bucket.max_days:
            return bucket.name
    
    return "Unknown"


def get_lapse_aging_band(days: int, buckets: List[BucketConfig] = None) -> str:
    """
    Get the lapse aging band based on number of days.
    
    Args:
        days: Number of days since last payment
        buckets: List of BucketConfig objects (uses default if None)
    
    Returns:
        Bucket name (e.g., "0-30", "31-60") or "Unknown" if no match
    """
    if buckets is None:
        buckets = DEFAULT_LAPSE_AGING_BUCKETS
    
    for bucket in buckets:
        if bucket.min_days <= days <= bucket.max_days:
            return bucket.name
    
    return "Unknown"


def get_all_bucket_names(bucket_type: str = "policy") -> List[str]:
    """
    Get all bucket names for a given bucket type.
    
    Args:
        bucket_type: Either "policy" or "lapse"
    
    Returns:
        List of bucket names
    """
    if bucket_type == "policy":
        return [b.name for b in DEFAULT_POLICY_AGING_BUCKETS]
    elif bucket_type == "lapse":
        return [b.name for b in DEFAULT_LAPSE_AGING_BUCKETS]
    else:
        raise ValueError(f"Invalid bucket_type: {bucket_type}. Must be 'policy' or 'lapse'")


def create_bucket_combinations(
    policy_buckets: List[str] = None,
    lapse_buckets: List[str] = None
) -> List[Tuple[str, str]]:
    """
    Create all combinations of policy and lapse aging buckets.
    
    Args:
        policy_buckets: List of policy bucket names (uses default if None)
        lapse_buckets: List of lapse bucket names (uses default if None)
    
    Returns:
        List of tuples (policy_bucket, lapse_bucket)
    """
    if policy_buckets is None:
        policy_buckets = get_all_bucket_names("policy")
    if lapse_buckets is None:
        lapse_buckets = get_all_bucket_names("lapse")
    
    return [(pb, lb) for pb in policy_buckets for lb in lapse_buckets]
