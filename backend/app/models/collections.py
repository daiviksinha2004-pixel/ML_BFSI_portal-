import uuid
from sqlalchemy import Column, String, Integer, Date, Numeric, Boolean, DateTime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from sqlalchemy.schema import ForeignKey
from app.db.base_class import Base
from sqlalchemy import Column, Float
class CollectionRecord(Base):
    __tablename__ = "collection_records"

    # ── Identity & Platform ──────────────────────────────────────────────
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id"), nullable=False)
    campaign_id = Column(UUID(as_uuid=True), ForeignKey("campaigns.id"), nullable=False)
    batch_id = Column(UUID(as_uuid=True), ForeignKey("ingestion_batches.id"), nullable=False)
    
    # ── Loan / Base identifiers ──────────────────────────────────────────
    loan_number = Column(String(50), nullable=False)
    cust_id = Column(String(50))
    source_client_id = Column(String(50))

    # ── Customer Demographics ────────────────────────────────────────────
    customer_occupation = Column(String(100))
    state = Column(String(100))
    res_pin_code = Column(String(20))
    gender = Column(String(20))
    salutation = Column(String(20))
    preferred_language = Column(String(50))
    depositor_mobile_number = Column(String(20))
    ref_cust_id = Column(String(50))

    # ── Financial & Dues ─────────────────────────────────────────────────
    paid_to_date = Column(Date)
    outstanding_premium = Column(Numeric(18,2))
    loan_amount = Column(Numeric(18,2))
    total_pos = Column(Numeric(18,2))
    emi_amount = Column(Numeric(18,2))
    emi_os = Column(Numeric(18,2))
    lpp_due = Column(Numeric(18,2))
    bounce_charge = Column(Numeric(18,2))
    total_penalty_charges = Column(Numeric(18,2))
    other_dues = Column(Numeric(18,2))
    total_emi_received = Column(Numeric(18,2))
    last_payment_date = Column(Date)
    
    # ── Loan Details & Product ───────────────────────────────────────────
    loan_disbursal_date = Column(Date)
    loan_completed = Column(String(50))
    loan_tenure = Column(Integer)
    loan_maturity_date = Column(Date)
    product_type = Column(String(100))
    product_name = Column(String(150))
    registration_no = Column(String(50))
    vehicle_name = Column(String(150))

    # ── State / Bucket ───────────────────────────────────────────────────
    bom_bucket = Column(String(50))
    bucket = Column(String(50))
    dpd = Column(Integer)
    policy_status = Column(String(50))
    delinquency_string = Column(String(50))
    credit_score = Column(String(20))
    propensity_band = Column(String(50))

    # ── Internal Flow & Conversion Signal ────────────────────────────────
    process_date = Column(Date)
    lot_date = Column(Date, primary_key=True, nullable=False)
    pmt_flag = Column(Boolean, nullable=False, default=False)
    
    # ── Temporal / batch tracking ────────────────────────────────────────
    dataset_month = Column(Date, nullable=False)
    raw_data = Column(JSONB)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    
    flag1 = Column(String(50), nullable=True)
    propensity = Column(String(50), nullable=True)
    # Add this with your other columns
    bounce_charge = Column(Float, default=0.0)
    