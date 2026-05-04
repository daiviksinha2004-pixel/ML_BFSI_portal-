"""
Helper to persist prediction results into the life_prediction_cache table.

Each public function:
  1. Deletes any existing rows for the (user_id, engine_type) pair.
  2. Inserts fresh rows from the prediction response.
  3. Commits in the same session that the caller provides.

This keeps the cache ephemeral — only the latest run is stored.
"""

import logging
from sqlalchemy.orm import Session

from app.models.prediction_cache import LifePredictionCache

logger = logging.getLogger(__name__)


def _clear_engine(db: Session, user_id, tenant_id, engine_type: str) -> None:
    """Delete all cached rows for a given user + engine."""
    db.query(LifePredictionCache).filter(
        LifePredictionCache.user_id == user_id,
        LifePredictionCache.tenant_id == tenant_id,
        LifePredictionCache.engine_type == engine_type,
    ).delete(synchronize_session="fetch")


def clear_all_for_user(db: Session, user_id, tenant_id) -> None:
    """Wipe the entire cache for a user (called on sign-out)."""
    db.query(LifePredictionCache).filter(
        LifePredictionCache.user_id == user_id,
        LifePredictionCache.tenant_id == tenant_id,
    ).delete(synchronize_session="fetch")
    db.commit()
    logger.info("Cleared full prediction cache for user %s", user_id)


# ─────────────────────────────────────────────────────────────────────────────
# Product-Group engine  (LapsePredictionService → /prediction/lapse)
# ─────────────────────────────────────────────────────────────────────────────

def cache_product_group_prediction(db: Session, user_id, tenant_id, response) -> None:
    """
    Persist product-group-based lapse prediction results.
    `response` is a LapsePredictionResponse instance.
    """
    engine = "product_group"
    _clear_engine(db, user_id, tenant_id, engine)

    rows = []
    target_month = response.target_month

    for pg in response.by_product_group:
        # Band-level detail rows
        for band in pg.lapse_band_breakdown:
            rows.append(LifePredictionCache(
                user_id=user_id,
                tenant_id=tenant_id,
                engine_type=engine,
                target_month=target_month,
                dimension_key="product_group",
                dimension_value=pg.product_group,
                lapse_aging_band=band.lapse_aging_band,
                policy_count=band.policy_count,
                historical_avg_paid_pct=band.historical_avg_paid_pct,
                predicted_paid_count=band.predicted_paid_count,
                predicted_paid_pct=None,
                predicted_collected_amount=band.predicted_collected_amount or 0.0,
                row_type="band",
            ))

        # Dimension-summary row
        rows.append(LifePredictionCache(
            user_id=user_id,
            tenant_id=tenant_id,
            engine_type=engine,
            target_month=target_month,
            dimension_key="product_group",
            dimension_value=pg.product_group,
            lapse_aging_band=None,
            policy_count=pg.total_policy_count,
            historical_avg_paid_pct=pg.historical_avg_paid_pct,
            predicted_paid_count=pg.predicted_paid_count,
            predicted_paid_pct=pg.predicted_paid_pct,
            predicted_collected_amount=pg.predicted_collected_amount or 0.0,
            row_type="summary",
        ))

    db.bulk_save_objects(rows)
    db.commit()
    logger.info(
        "Cached %d product_group prediction rows for user %s (month=%s)",
        len(rows), user_id, target_month,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Channel engine  (ChannelPredictionService → /channel-prediction/lapse)
# ─────────────────────────────────────────────────────────────────────────────

def cache_channel_prediction(db: Session, user_id, tenant_id, response) -> None:
    """
    Persist channel-based lapse prediction results.
    `response` is a ChannelPredictionResponse instance.
    """
    engine = "channel"
    _clear_engine(db, user_id, tenant_id, engine)

    rows = []
    target_month = response.target_month

    for ch in response.by_channel:
        # Band-level detail rows
        for band in ch.lapse_band_breakdown:
            rows.append(LifePredictionCache(
                user_id=user_id,
                tenant_id=tenant_id,
                engine_type=engine,
                target_month=target_month,
                dimension_key="channel",
                dimension_value=ch.channel,
                lapse_aging_band=band.lapse_aging_band,
                policy_count=band.policy_count,
                historical_avg_paid_pct=band.historical_avg_paid_pct,
                predicted_paid_count=band.predicted_paid_count,
                predicted_paid_pct=None,
                predicted_collected_amount=band.predicted_collected_amount or 0.0,
                row_type="band",
            ))

        # Dimension-summary row
        rows.append(LifePredictionCache(
            user_id=user_id,
            tenant_id=tenant_id,
            engine_type=engine,
            target_month=target_month,
            dimension_key="channel",
            dimension_value=ch.channel,
            lapse_aging_band=None,
            policy_count=ch.total_policy_count,
            historical_avg_paid_pct=ch.historical_avg_paid_pct,
            predicted_paid_count=ch.predicted_paid_count,
            predicted_paid_pct=ch.predicted_paid_pct,
            predicted_collected_amount=ch.predicted_collected_amount or 0.0,
            row_type="summary",
        ))

    db.bulk_save_objects(rows)
    db.commit()
    logger.info(
        "Cached %d channel prediction rows for user %s (month=%s)",
        len(rows), user_id, target_month,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Product-Type engine  (ProductTypePredictionService → /product-type-prediction/lapse)
# ─────────────────────────────────────────────────────────────────────────────

def cache_product_type_prediction(db: Session, user_id, tenant_id, response) -> None:
    """
    Persist product-type-based lapse prediction results.
    `response` is a ProductTypePredictionResponse instance.
    """
    engine = "product_type"
    _clear_engine(db, user_id, tenant_id, engine)

    rows = []
    target_month = response.target_month

    for pt in response.by_product_type:
        # Band-level detail rows
        for band in pt.lapse_band_breakdown:
            rows.append(LifePredictionCache(
                user_id=user_id,
                tenant_id=tenant_id,
                engine_type=engine,
                target_month=target_month,
                dimension_key="product_type",
                dimension_value=pt.product_type,
                lapse_aging_band=band.lapse_aging_band,
                policy_count=band.policy_count,
                historical_avg_paid_pct=band.historical_avg_paid_pct,
                predicted_paid_count=band.predicted_paid_count,
                predicted_paid_pct=None,
                predicted_collected_amount=band.predicted_collected_amount or 0.0,
                row_type="band",
            ))

        # Dimension-summary row
        rows.append(LifePredictionCache(
            user_id=user_id,
            tenant_id=tenant_id,
            engine_type=engine,
            target_month=target_month,
            dimension_key="product_type",
            dimension_value=pt.product_type,
            lapse_aging_band=None,
            policy_count=pt.total_policy_count,
            historical_avg_paid_pct=pt.historical_avg_paid_pct,
            predicted_paid_count=pt.predicted_paid_count,
            predicted_paid_pct=pt.predicted_paid_pct,
            predicted_collected_amount=pt.predicted_collected_amount or 0.0,
            row_type="summary",
        ))

    db.bulk_save_objects(rows)
    db.commit()
    logger.info(
        "Cached %d product_type prediction rows for user %s (month=%s)",
        len(rows), user_id, target_month,
    )
