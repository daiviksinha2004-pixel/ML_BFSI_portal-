"""
Temporary prediction cache table for Life Insurance.

Stores the output of all three prediction engines (channel-based, product-type-based,
and predictive lapse / product-group-based) so that they can be collectively
queried in the Prediction Window for a unified view.

Lifecycle:
  - WRITE  : Each engine inserts rows when the user clicks "Run Prediction".
  - CLEAR  : All rows for that (user_id, engine_type) are DELETEd before each
             new run, and all rows for that user_id are DELETEd on sign-out.
"""

import uuid
from sqlalchemy import (
    Column, String, Integer, Float, DateTime, Index, Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.db.base_class import Base


class LifePredictionCache(Base):
    """
    Ephemeral cache of prediction results from the three Life Insurance
    forecasting engines.  One row per (user, run, engine, dimension_value,
    lapse_band) combination.
    """

    __tablename__ = "life_prediction_cache"

    # ── Primary key ──────────────────────────────────────────────────────────
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # ── Session / ownership ──────────────────────────────────────────────────
    user_id = Column(
        UUID(as_uuid=True),
        nullable=False,
        comment="Owner of this prediction run (FK to users.id conceptually).",
    )
    tenant_id = Column(
        UUID(as_uuid=True),
        nullable=False,
        comment="Tenant scope — ensures multi-tenant isolation.",
    )

    # ── Engine identification ────────────────────────────────────────────────
    engine_type = Column(
        String(30),
        nullable=False,
        comment=(
            "Which engine produced this row: "
            "'channel' | 'product_type' | 'product_group'."
        ),
    )

    # ── Prediction context ───────────────────────────────────────────────────
    target_month = Column(
        String(7),
        nullable=False,
        comment="Target month in YYYY-MM format.",
    )

    # ── Dimension value ──────────────────────────────────────────────────────
    # The primary grouping key differs per engine but is stored uniformly:
    #   channel engine       → channel name  (e.g. "Agency", "Direct")
    #   product_type engine  → product type  (e.g. "ULIP", "Traditional")
    #   product_group engine → product group (e.g. "G1", "G2")
    dimension_key = Column(
        String(30),
        nullable=False,
        comment="Name of the grouping dimension (channel / product_type / product_group).",
    )
    dimension_value = Column(
        String(100),
        nullable=False,
        comment="Value within the dimension, e.g. 'Agency' or 'ULIP'.",
    )

    # ── Band-level detail (nullable for summary rows) ────────────────────────
    lapse_aging_band = Column(
        String(15),
        nullable=True,
        comment="Lapse aging band, e.g. '0-30', '360+'. NULL for dimension-summary rows.",
    )

    # ── Prediction metrics ───────────────────────────────────────────────────
    policy_count = Column(
        Integer,
        nullable=False,
        default=0,
        comment="Number of target-month policies in this bucket.",
    )
    historical_avg_paid_pct = Column(
        Float,
        nullable=False,
        default=0.0,
        comment="Historical average paid percentage for this bucket.",
    )
    predicted_paid_count = Column(
        Float,
        nullable=False,
        default=0.0,
        comment="Forecasted number of policies that will pay.",
    )
    predicted_paid_pct = Column(
        Float,
        nullable=True,
        comment="Predicted paid percentage (summary-level only).",
    )
    predicted_collected_amount = Column(
        Float,
        nullable=False,
        default=0.0,
        comment="Predicted total collection amount (₹).",
    )

    # ── Row type flag ────────────────────────────────────────────────────────
    row_type = Column(
        String(10),
        nullable=False,
        default="band",
        comment="'band' for per-lapse-band rows, 'summary' for dimension-level aggregates.",
    )

    # ── Timestamps ───────────────────────────────────────────────────────────
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        comment="When this row was inserted.",
    )

    # ── Indexes for fast lookup & cleanup ────────────────────────────────────
    __table_args__ = (
        Index("ix_lpc_user_engine", "user_id", "engine_type"),
        Index("ix_lpc_user_target", "user_id", "target_month"),
        Index("ix_lpc_tenant", "tenant_id"),
    )
