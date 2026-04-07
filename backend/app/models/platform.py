import uuid
from sqlalchemy import Column, String, Boolean, Integer, DateTime, Text, Date, Numeric
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from sqlalchemy.schema import ForeignKey
from app.db.base_class import Base

class Tenant(Base):
    __tablename__ = "tenants"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String(32), unique=True, nullable=False)
    name = Column(String(255), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    contact_email = Column(String(255))
    max_users = Column(Integer, nullable=False, default=50)
    metadata_obj = Column("metadata", JSONB) 
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

class User(Base):
    __tablename__ = "users"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="RESTRICT"), nullable=False)
    email = Column(String(255), nullable=False)
    password_hash = Column(Text, nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(String(64), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    failed_logins = Column(Integer, nullable=False, default=0)
    locked_until = Column(DateTime(timezone=True))
    last_login_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

# ─── NEW LAYER 1 MODELS ADDED BELOW ────────────────────────────

class Client(Base):
    __tablename__ = "clients"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    client_name = Column(String(200), nullable=False)
    client_code = Column(String(50), nullable=False)   # e.g., 'BSLI', 'HDFC'
    domain_type = Column(String(50), nullable=False)   # 'life_insurance', 'health_insurance', 'debt_collection'
    is_active = Column(Boolean, nullable=False, default=True)
    contact_email = Column(String(255))
    metadata_obj = Column("metadata", JSONB)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

class Campaign(Base):
    __tablename__ = "campaigns"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id"), nullable=False)
    name = Column(String(255), nullable=False)
    campaign_domain = Column(String(50), nullable=False) # 'life_retention', 'health_retention', 'debt_collection'
    campaign_type = Column(String(100))
    start_date = Column(Date, nullable=False)
    end_date = Column(Date)
    target_amount = Column(Numeric(18,2))
    status = Column(String(32), nullable=False, default='active')
    metadata_obj = Column("metadata", JSONB)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)