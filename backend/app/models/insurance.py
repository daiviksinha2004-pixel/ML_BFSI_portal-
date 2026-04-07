import uuid
from sqlalchemy import Column, String, Integer, Date, Numeric, Boolean, SmallInteger, DateTime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from sqlalchemy.schema import ForeignKey
from app.db.base_class import Base

class InsuranceRecordMixin:
    """
    Shared schema for both Life and Health Insurance datasets.
    """
    # ── Identity & Platform ────────────────────────────────────
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id"), nullable=False)
    campaign_id = Column(UUID(as_uuid=True), ForeignKey("campaigns.id"), nullable=False)
    batch_id = Column(UUID(as_uuid=True), ForeignKey("ingestion_batches.id"), nullable=False)

    # ── Policy identifiers ──────────────────────────────────────
    policy_no = Column(String(20), nullable=False)
    cust_id = Column(String(15))
    agent_code = Column(String(15))

    # ── Policy master attributes ────────────────────────────────
    policy_status = Column(String(20))
    policy_issue_date = Column(Date)
    paid_to_date = Column(Date)
    policy_lapse_date = Column(Date)
    max_ri_date = Column(Date)
    quotation_valid_upto_date = Column(Date)
    policy_paying_frequency = Column(SmallInteger)
    policy_paying_term = Column(SmallInteger)
    policy_year = Column(String(30))
    policy_source_code = Column(String(20))

    # ── Product attributes ──────────────────────────────────────
    product_type = Column(String(30))
    product_name_raw = Column(String(200))
    product_code = Column(String(10))
    product_category_raw = Column(String(100))
    productgroup = Column(String(5))

    # ── Premium financials ──────────────────────────────────────
    outstanding_premium = Column(Numeric(18,2))
    modal_premium = Column(Numeric(18,2))
    annual_premium = Column(Numeric(18,2))
    act_premium = Column(Numeric(18,2))
    amount_in_suspence = Column(Numeric(18,2))
    interest_charged = Column(Numeric(18,2))

    # ── Ageing & lapse analytics ────────────────────────────────
    policy_ageing = Column(Integer)
    lapse_ageing = Column(Integer)
    policy_ageing_band = Column(String(10))

    # ── Propensity & campaign bucketing ─────────────────────────
    propensity_band = Column(String(20))
    ptd_slab = Column(String(15))
    client_bucket = Column(String(20))
    priority_bucket = Column(String(50))
    sub_campaign_name = Column(String(30))
    campaign_type_code = Column(String(20))

    # ── Agent / distribution channel ────────────────────────────
    agent_status = Column(String(15))
    channel = Column(String(50))
    source_agency_name = Column(String(30))
    payment_mode = Column(String(5))
    branch_code = Column(String(15))
    branch_name = Column(String(50))

    # ── Geography ───────────────────────────────────────────────
    city = Column(String(50))
    state = Column(String(50))
    pin_code = Column(String(10))
    zone = Column(String(30))
    preferred_language = Column(String(20))

    # ── Conversion signal ───────────────────────────────────────
    pmt_flag = Column(Boolean, nullable=False, default=False)

    # ── Temporal / batch tracking ───────────────────────────────
    lot_date = Column(Date, primary_key=True, nullable=False)
    dataset_month = Column(Date, nullable=False)

    # ── Raw capture & metadata ──────────────────────────────────
    raw_data = Column(JSONB)
    months_in_campaign = Column(SmallInteger, nullable=False, default=1)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

# ─── THE ACTUAL TABLES ──────────────────────────────────────────

class LifeCampaignRecord(InsuranceRecordMixin, Base):
    __tablename__ = "life_campaign_records"

class HealthRetentionRecord(InsuranceRecordMixin, Base):
    __tablename__ = "health_retention_records"