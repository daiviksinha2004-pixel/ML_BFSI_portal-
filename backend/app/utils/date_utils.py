"""
Date utility functions for lapse prediction and forecasting.
"""
from datetime import datetime, timedelta
from typing import List
from dateutil.relativedelta import relativedelta


def get_last_4_months(target_month: str) -> List[str]:
    """
    Get the last 4 months before the target month.
    
    Args:
        target_month: String in format "YYYY-MM" (e.g., "2026-04")
    
    Returns:
        List of 4 month strings in format "YYYY-MM" in reverse chronological order
        (most recent first)
    
    Example:
        Input: "2026-04"
        Output: ["2026-03", "2026-02", "2026-01", "2025-12"]
    
    Raises:
        ValueError: If target_month format is invalid
    """
    try:
        # Parse target month (set to first day of the month)
        target_date = datetime.strptime(target_month, "%Y-%m")
    except ValueError as e:
        raise ValueError(f"Invalid target_month format: {target_month}. Expected format: YYYY-MM") from e
    
    months = []
    for i in range(1, 5):  # 1 to 4 months back
        prev_month = target_date - relativedelta(months=i)
        months.append(prev_month.strftime("%Y-%m"))
    
    return months


def get_first_day_of_month(target_month: str) -> datetime:
    """
    Get the first day of the target month as a datetime object.
    
    Args:
        target_month: String in format "YYYY-MM"
    
    Returns:
        datetime object representing the first day of the month
    
    Raises:
        ValueError: If target_month format is invalid
    """
    try:
        return datetime.strptime(target_month, "%Y-%m")
    except ValueError as e:
        raise ValueError(f"Invalid target_month format: {target_month}. Expected format: YYYY-MM") from e


def calculate_days_between(start_date, end_date) -> int:
    """
    Calculate the number of days between two dates.
    
    Args:
        start_date: Start date (datetime or date)
        end_date: End date (datetime or date)
    
    Returns:
        Number of days between the two dates (non-negative)
    """
    if start_date is None or end_date is None:
        return 0
    
    # Convert both to date objects to handle datetime/date mismatch
    from datetime import date
    if hasattr(start_date, 'date'):
        start_date = start_date.date()
    if hasattr(end_date, 'date'):
        end_date = end_date.date()
    
    delta = end_date - start_date
    return max(0, delta.days)
