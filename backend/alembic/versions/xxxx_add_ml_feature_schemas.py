"""add ml_feature_schemas table

Revision ID: bf3a92c1d4e7
Revises: 95d51e0d7cd0
Create Date: 2026-04-03
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'bf3a92c1d4e7'
down_revision: Union[str, None] = '95d51e0d7cd0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'ml_feature_schemas',
        sa.Column('id',            postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('model_name',    sa.String(100),  nullable=False),
        sa.Column('feature_names', postgresql.JSONB, nullable=False),
        sa.Column('imputer_cols',  postgresql.JSONB, nullable=False),
        sa.Column('all_nan_cols',  postgresql.JSONB, nullable=False),
        sa.Column('raw_columns',   postgresql.JSONB, nullable=False),
        sa.Column('drop_cols',     postgresql.JSONB, nullable=False),
        sa.Column('metrics',       postgresql.JSONB, nullable=True),
        sa.Column('trained_at',    sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at',    sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
    )
    op.create_index(
        'ix_ml_feature_schemas_model_name',
        'ml_feature_schemas', ['model_name'], unique=True
    )


def downgrade() -> None:
    op.drop_index('ix_ml_feature_schemas_model_name',
                  table_name='ml_feature_schemas')
    op.drop_table('ml_feature_schemas')