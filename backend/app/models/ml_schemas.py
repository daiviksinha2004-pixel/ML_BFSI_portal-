import uuid
from sqlalchemy import Column, String, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from sqlalchemy.schema import ForeignKey
from app.db.base_class import Base


class MLFeatureSchema(Base):
    """
    Stores the feature schema for each trained ML model.
    Automatically populated at train time, read at inference time.
    No manual maintenance needed.
    """
    __tablename__ = "ml_feature_schemas"

    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    model_name    = Column(String(100), nullable=False, unique=True, index=True)
    # e.g. "logistic_life", "logistic_health"

    feature_names = Column(JSONB, nullable=False)
    # list of feature names after zero-var drop — matches FEATURES_PATH

    imputer_cols  = Column(JSONB, nullable=False)
    # list of columns the imputer was fit on (pre zero-var drop)

    all_nan_cols  = Column(JSONB, nullable=False)
    # columns dropped because all-NaN in training

    raw_columns   = Column(JSONB, nullable=False)
    # original DB columns used at train time → drives dynamic Pydantic schema

    drop_cols     = Column(JSONB, nullable=False)
    # DROP_COLS snapshot at train time

    metrics       = Column(JSONB)
    # last training metrics snapshot

    trained_at    = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at    = Column(DateTime(timezone=True), server_default=func.now(),
                           onupdate=func.now(), nullable=False)