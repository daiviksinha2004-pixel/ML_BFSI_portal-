from typing import List, Optional

from pydantic import BaseModel, Field, constr


MonthStr = constr(pattern=r"^\d{4}-\d{2}$")


class LapseForecastRequest(BaseModel):
    target_month: MonthStr = Field(..., description="Forecast month in YYYY-MM format")
    product_groups: Optional[List[str]] = None


class MonthlyBreakdown(BaseModel):
    month: MonthStr
    product_group: str
    policy_aging_band: str
    lapse_aging_band: str
    total_policy_count: int
    paid_policy_count: float
    paid_percentage: float


class BandLevelForecast(BaseModel):
    product_group: str
    policy_aging_band: str
    lapse_aging_band: str
    avg_paid_percentage: float
    target_policy_count: int
    forecast_paid_count: float
    forecast_collected_amount: Optional[float] = 0.0


class ProductGroupSummary(BaseModel):
    product_group: str
    avg_paid_percentage: float
    target_policy_count: int
    forecast_paid_count: float
    forecast_collected_amount: Optional[float] = 0.0


class LapseForecastResponse(BaseModel):
    target_month: MonthStr
    comparison_months: List[MonthStr]
    summary_by_product_group: List[ProductGroupSummary]
    band_level_forecast: List[BandLevelForecast]
    monthly_breakdown: List[MonthlyBreakdown]