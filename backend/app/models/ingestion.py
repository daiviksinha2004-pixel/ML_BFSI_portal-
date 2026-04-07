import uuid
from sqlalchemy import Column, String, Integer, DateTime, Date, Boolean, Text, BigInteger
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from sqlalchemy.schema import ForeignKey
from app.db.base_class import Base

class IngestionBatch(Base):
    __tablename__ = "ingestion_batches"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id"), nullable=False)
    campaign_id = Column(UUID(as_uuid=True), ForeignKey("campaigns.id"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    dataset_month = Column(Date, nullable=False)
    status = Column(String(32), nullable=False, default='pending')
    total_records = Column(Integer, nullable=False, default=0)
    processed_records = Column(Integer, nullable=False, default=0)
    error_count = Column(Integer, nullable=False, default=0)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

class Upload(Base):
    __tablename__ = "uploads"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    batch_id = Column(UUID(as_uuid=True), ForeignKey("ingestion_batches.id"), nullable=False)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    original_filename = Column(String(512), nullable=False)
    minio_key = Column(Text, nullable=False, unique=True)
    sha256_checksum = Column(String(64), nullable=False)
    file_size_bytes = Column(BigInteger, nullable=False)
    mime_type = Column(String(128))
    status = Column(String(32), nullable=False, default='queued')
    row_count = Column(Integer)
    error_count = Column(Integer, nullable=False, default=0)
    error_summary = Column(JSONB)
    reconcile_needed = Column(Boolean, nullable=False, default=False)
    uploaded_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    completed_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)