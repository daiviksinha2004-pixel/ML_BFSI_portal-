from app.db.base_class import Base  # noqa

# Import all models here so Alembic autogenerate can detect them
# Order matters — dependencies first
from app.models.audit import AuditLog                                        # noqa
from app.models.platform import Tenant, User, Client, Campaign               # noqa
from app.models.ingestion import IngestionBatch, Upload                      # noqa
from app.models.insurance import LifeCampaignRecord, HealthRetentionRecord   # noqa
from app.models.collections import CollectionRecord                          # noqa
from app.models.ml_schemas import MLFeatureSchema                            # noqa