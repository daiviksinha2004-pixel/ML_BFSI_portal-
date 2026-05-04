# This file ensures all models are registered with Base.metadata
# Required for Alembic autogenerate and SQLAlchemy create_all

from app.models.audit import AuditLog                          # noqa
from app.models.platform import Tenant, User, Client, Campaign # noqa
from app.models.ingestion import IngestionBatch, Upload        # noqa
from app.models.insurance import LifeCampaignRecord, HealthRetentionRecord  # noqa
from app.models.collections import CollectionRecord            # noqa
from app.models.ml_schemas import MLFeatureSchema              # noqa
from app.models.prediction_cache import LifePredictionCache    # noqa