from sqlalchemy import Column, String, BigInteger, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB, INET
from sqlalchemy.sql import func
from sqlalchemy.schema import ForeignKey
from app.db.base_class import Base

class AuditLog(Base):
    __tablename__ = "audit_logs"

    # BigInteger autoincrement maps directly to BIGSERIAL in Postgres
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"))
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    
    # What was touched? e.g., 'user_session', 'life_campaign_records'
    entity_type = Column(String(64), nullable=False) 
    entity_id = Column(Text)
    
    # What happened? e.g., 'login_success', 'login_failed', 'file_uploaded'
    action = Column(String(64), nullable=False)      
    
    # State tracking
    old_data = Column(JSONB)
    new_data = Column(JSONB)
    
    # Security tracking
    ip_address = Column(INET)                        # Perfect for IP tracking
    user_agent = Column(Text)                        # Captures Browser, OS, and Device
    request_id = Column(String(64))
    
    occurred_at = Column(DateTime(timezone=True), primary_key=True, server_default=func.now(), nullable=False)