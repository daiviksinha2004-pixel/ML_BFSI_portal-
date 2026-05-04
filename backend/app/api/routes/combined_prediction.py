"""
FastAPI router for combined prediction summary from life_prediction_cache.

Reads cached prediction rows inserted by the three engines and returns
aggregated KPIs and per-engine breakdowns for the Prediction Window.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.api.dependencies import get_db, get_current_user
from app.models.platform import User
from app.models.prediction_cache import LifePredictionCache

router = APIRouter()


@router.get("/combined-summary")
def get_combined_prediction_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return aggregated prediction KPIs and per-engine breakdowns
    from the life_prediction_cache for the current user.
    """

    # ── Fetch all cached rows for this user ──────────────────────────────────
    rows = (
        db.query(LifePredictionCache)
        .filter(
            LifePredictionCache.user_id == current_user.id,
            LifePredictionCache.tenant_id == current_user.tenant_id,
        )
        .all()
    )

    if not rows:
        return {
            "status": "empty",
            "message": "No cached predictions found. Run the prediction engines first.",
            "engines": [],
            "combined_kpis": None,
            "engine_summaries": [],
            "engine_band_details": [],
        }

    # ── Separate by engine ───────────────────────────────────────────────────
    engines_present = set()
    target_months = set()

    # Per-engine summary aggregation
    engine_data = {}  # engine_type -> { summaries: [...], bands: [...] }

    for row in rows:
        engines_present.add(row.engine_type)
        target_months.add(row.target_month)

        if row.engine_type not in engine_data:
            engine_data[row.engine_type] = {"summaries": [], "bands": []}

        if row.row_type == "summary":
            engine_data[row.engine_type]["summaries"].append(row)
        else:
            engine_data[row.engine_type]["bands"].append(row)

    # ── Build per-engine summaries ───────────────────────────────────────────
    engine_summaries = []
    combined_paid_count = 0.0
    combined_total_count = 0
    combined_amount = 0.0

    for engine_type in sorted(engines_present):
        summaries = engine_data[engine_type]["summaries"]
        eng_paid = sum(s.predicted_paid_count for s in summaries)
        eng_total = sum(s.policy_count for s in summaries)
        eng_amount = sum(s.predicted_collected_amount for s in summaries)
        eng_pct = (eng_paid / eng_total * 100) if eng_total > 0 else 0.0

        combined_paid_count += eng_paid
        combined_total_count += eng_total
        combined_amount += eng_amount

        # Per-dimension breakdown
        dimension_breakdown = []
        for s in summaries:
            dimension_breakdown.append({
                "dimension_value": s.dimension_value,
                "policy_count": s.policy_count,
                "historical_avg_paid_pct": round(s.historical_avg_paid_pct, 2),
                "predicted_paid_count": round(s.predicted_paid_count, 1),
                "predicted_paid_pct": round(s.predicted_paid_pct, 2) if s.predicted_paid_pct else None,
                "predicted_collected_amount": round(s.predicted_collected_amount, 2),
            })

        engine_summaries.append({
            "engine_type": engine_type,
            "dimension_key": summaries[0].dimension_key if summaries else engine_type,
            "total_policy_count": eng_total,
            "predicted_paid_count": round(eng_paid, 1),
            "predicted_paid_pct": round(eng_pct, 2),
            "predicted_collected_amount": round(eng_amount, 2),
            "dimension_breakdown": dimension_breakdown,
        })

    # ── Build per-engine band-level details (for lapse band chart) ───────────
    engine_band_details = []
    for engine_type in sorted(engines_present):
        bands = engine_data[engine_type]["bands"]

        # Aggregate by lapse_aging_band across all dimension values
        band_agg = {}
        for b in bands:
            key = b.lapse_aging_band or "Unknown"
            if key not in band_agg:
                band_agg[key] = {
                    "lapse_aging_band": key,
                    "policy_count": 0,
                    "predicted_paid_count": 0.0,
                    "predicted_collected_amount": 0.0,
                    "historical_avg_paid_pct_sum": 0.0,
                    "count": 0,
                }
            band_agg[key]["policy_count"] += b.policy_count
            band_agg[key]["predicted_paid_count"] += b.predicted_paid_count
            band_agg[key]["predicted_collected_amount"] += b.predicted_collected_amount
            band_agg[key]["historical_avg_paid_pct_sum"] += b.historical_avg_paid_pct
            band_agg[key]["count"] += 1

        band_list = []
        for key in sorted(band_agg.keys(), key=lambda x: int(''.join(filter(str.isdigit, x.split("-")[0]))) if any(c.isdigit() for c in x) else 9999):
            agg = band_agg[key]
            avg_hist = agg["historical_avg_paid_pct_sum"] / agg["count"] if agg["count"] > 0 else 0
            band_list.append({
                "lapse_aging_band": key,
                "policy_count": agg["policy_count"],
                "predicted_paid_count": round(agg["predicted_paid_count"], 1),
                "predicted_collected_amount": round(agg["predicted_collected_amount"], 2),
                "historical_avg_paid_pct": round(avg_hist, 2),
            })

        engine_band_details.append({
            "engine_type": engine_type,
            "bands": band_list,
        })

    # ── Combined KPIs (average across engines) ───────────────────────────────
    n_engines = len(engines_present)
    avg_paid = combined_paid_count / n_engines if n_engines > 0 else 0
    avg_amount = combined_amount / n_engines if n_engines > 0 else 0
    # Use the average total count from all engines (they should be roughly equal)
    avg_total = combined_total_count / n_engines if n_engines > 0 else 0
    avg_pct = (avg_paid / avg_total * 100) if avg_total > 0 else 0

    combined_kpis = {
        "engines_count": n_engines,
        "target_month": list(target_months)[0] if target_months else None,
        "avg_predicted_paid_count": round(avg_paid, 1),
        "avg_total_policy_count": round(avg_total),
        "avg_predicted_paid_pct": round(avg_pct, 2),
        "avg_predicted_collected_amount": round(avg_amount, 2),
        # Individual engine totals for comparison chart
        "total_predicted_paid_count": round(combined_paid_count, 1),
        "total_predicted_collected_amount": round(combined_amount, 2),
    }

    return {
        "status": "ok",
        "engines": sorted(list(engines_present)),
        "combined_kpis": combined_kpis,
        "engine_summaries": engine_summaries,
        "engine_band_details": engine_band_details,
    }
