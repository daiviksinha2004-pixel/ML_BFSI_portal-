from pydantic import BaseModel
from typing import Optional
from datetime import date
from uuid import UUID
from decimal import Decimal


class LifePredictPayload(BaseModel):
    # ── Policy identifiers ────────────────────────────────
    policy_no:                  Optional[str]     = None
    cust_id:                    Optional[str]     = None
    agent_code:                 Optional[str]     = None

    # ── Policy master attributes ──────────────────────────
    policy_issue_date:          Optional[date]    = None
    paid_to_date:               Optional[date]    = None
    policy_lapse_date:          Optional[date]    = None
    max_ri_date:                Optional[date]    = None
    quotation_valid_upto_date:  Optional[date]    = None
    policy_paying_frequency:    Optional[int]     = None
    policy_paying_term:         Optional[int]     = None
    policy_year:                Optional[str]     = None
    policy_source_code:         Optional[str]     = None

    # ── Product attributes ────────────────────────────────
    product_type:               Optional[str]     = None
    product_name_raw:           Optional[str]     = None
    product_code:               Optional[str]     = None
    product_category_raw:       Optional[str]     = None
    productgroup:               Optional[str]     = None

    # ── Premium financials ────────────────────────────────
    outstanding_premium:        Optional[Decimal] = None
    modal_premium:              Optional[Decimal] = None
    annual_premium:             Optional[Decimal] = None
    act_premium:                Optional[Decimal] = None
    amount_in_suspence:         Optional[Decimal] = None
    interest_charged:           Optional[Decimal] = None

    # ── Ageing & lapse analytics ──────────────────────────
    policy_ageing:              Optional[int]     = None
    lapse_ageing:               Optional[int]     = None
    policy_ageing_band:         Optional[str]     = None

    # ── Propensity & campaign bucketing ───────────────────
    propensity_band:            Optional[str]     = None
    ptd_slab:                   Optional[str]     = None
    client_bucket:              Optional[str]     = None
    priority_bucket:            Optional[str]     = None
    sub_campaign_name:          Optional[str]     = None
    campaign_type_code:         Optional[str]     = None

    # ── Agent / distribution channel ─────────────────────
    agent_status:               Optional[str]     = None
    channel:                    Optional[str]     = None
    source_agency_name:         Optional[str]     = None
    payment_mode:               Optional[str]     = None
    branch_code:                Optional[str]     = None
    branch_name:                Optional[str]     = None

    # ── Geography ─────────────────────────────────────────
    city:                       Optional[str]     = None
    state:                      Optional[str]     = None
    pin_code:                   Optional[str]     = None
    zone:                       Optional[str]     = None
    preferred_language:         Optional[str]     = None

    # ── Temporal / batch tracking ─────────────────────────
    lot_date:                   Optional[date]    = None
    dataset_month:              Optional[date]    = None
    months_in_campaign:         Optional[int]     = None

    # ── IDs (kept for context, not used in model) ─────────
    batch_id:                   Optional[UUID]    = None
    tenant_id:                  Optional[UUID]    = None
    client_id:                  Optional[UUID]    = None
    campaign_id:                Optional[UUID]    = None

    class Config:
        extra = "allow"   # forward-compatible with schema changes


class LifePredictResponse(BaseModel):
    index:             int
    propensity_score:  float
    prediction:        int
    prediction_label:  str
    confidence:        str