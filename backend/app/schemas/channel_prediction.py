"""
Pydantic schemas for channel-based lapse prediction endpoint.
"""
from typing import List, Optional

from pydantic import BaseModel, Field, constr


MonthStr = constr(pattern=r"^\d{4}-\d{2}$")


class ChannelPredictionRequest(BaseModel):
    target_month: MonthStr = Field(..., description="Prediction month in YYYY-MM format")


class ChannelPaidPct(BaseModel):
    channel: str
    avg_paid_pct: float


class ReferenceMonthDetail(BaseModel):
    month: MonthStr
    channel_paid_pct: List[ChannelPaidPct]


class LapseBandBreakdown(BaseModel):
    lapse_aging_band: str
    policy_count: int
    historical_avg_paid_pct: float
    predicted_paid_count: float
    predicted_collected_amount: Optional[float] = 0.0


class ChannelPrediction(BaseModel):
    channel: str
    historical_avg_paid_pct: float
    total_policy_count: int
    predicted_paid_count: float
    predicted_paid_pct: float
    predicted_collected_amount: Optional[float] = 0.0
    lapse_band_breakdown: List[LapseBandBreakdown]


class PredictionSummary(BaseModel):
    overall_predicted_paid_count: float
    overall_total_policy_count: int
    overall_predicted_paid_pct: float
    overall_predicted_collected_amount: Optional[float] = 0.0


class ChannelPredictionResponse(BaseModel):
    target_month: MonthStr
    reference_months: List[MonthStr]
    summary: PredictionSummary
    by_channel: List[ChannelPrediction]
    reference_month_details: List[ReferenceMonthDetail]
