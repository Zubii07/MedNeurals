from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text

from app.api.reads import pagination
from app.database.connection import engine
from app.schemas.recommendations import RecommendationPage, RecommendationSummary
from app.services.recommendations import (
    RecommendationError,
    RunNotFound,
    generate_recommendations,
    latest_recommendation_run_id,
)
from app.services.model_runs import latest_completed_run_id

router = APIRouter(prefix="/recommendations", tags=["recommendations"])

PRIORITY_ORDER = "CASE r.priority WHEN 'HIGH' THEN 0 WHEN 'MODERATE' THEN 1 ELSE 2 END"


@router.post("/refresh", response_model=RecommendationSummary)
def refresh(model_run_id: int | None = Query(None, description="Stockout run of a refresh. Default: latest completed")):
    try:
        return generate_recommendations(engine, model_run_id)
    except RunNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RecommendationError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("", response_model=RecommendationPage)
def list_recommendations(
    model_run_id: int | None = Query(None, description="Stockout run of a refresh. Default: latest with recommendations"),
    action: Literal["PURCHASE", "TRANSFER", "EXPEDITE_PO", "NONE"] | None = None,
    priority: Literal["HIGH", "MODERATE", "LOW"] | None = None,
    item_id: str | None = None,
    store_id: str | None = None,
    page: dict[str, int] = Depends(pagination),
):
    """One recommendation set, most urgent first."""
    with engine.connect() as conn:
        if model_run_id is None:
            model_run_id = latest_recommendation_run_id(conn)
            if model_run_id is None:
                raise HTTPException(status_code=404, detail="no recommendations yet; call POST /recommendations/refresh")
        run = conn.execute(text("""SELECT model_run_id, demand_model_run_id, prediction_date, data_cutoff_date
                                   FROM recommendations WHERE model_run_id = :id LIMIT 1"""), {"id": model_run_id}).one_or_none()
        if run is None:
            raise HTTPException(status_code=404, detail=f"no recommendations for model run {model_run_id}")

        where = ["r.model_run_id = :run"]
        params = {"run": model_run_id, **page}
        for name, value in (("action", action), ("priority", priority), ("item_id", item_id), ("store_id", store_id)):
            if value:
                where.append(f"r.{name} = :{name}")
                params[name] = value
        latest_run = latest_completed_run_id(conn)
        condition = " AND ".join(where)
        total = conn.execute(text(f"SELECT count(*) FROM recommendations r WHERE {condition}"), params).scalar()
        rows = conn.execute(text(f"""
            SELECT r.*, i.item_name, i.uom, s.supplier_name
            FROM recommendations r
            JOIN medical_items i ON i.item_id = r.item_id
            JOIN suppliers s ON s.supplier_id = r.supplier_id
            WHERE {condition}
            ORDER BY {PRIORITY_ORDER}, r.stockout_probability DESC, r.item_id, r.store_id
            LIMIT :limit OFFSET :offset"""), params).mappings().all()

    return {
        **run._mapping, "latest_prediction_run_id": latest_run, "is_latest": model_run_id == latest_run,
        "total": total, **page,
        "items": [{
            "id": r["id"], "product_id": r["item_id"], "product_name": r["item_name"], "unit": r["uom"],
            "store_id": r["store_id"], "action": r["action"], "priority": r["priority"],
            "recommended_purchase_quantity": r["recommended_quantity"], "transfer_quantity": r["transfer_qty"],
            "safety_stock": round(r["safety_stock"], 2), "reorder_point": round(r["reorder_point"], 2),
            "order_up_to_level": round(r["order_up_to_level"], 2), "inventory_position": r["inventory_position"],
            "reason": r["reason"], "status": r["status"],
            "details": {
                "current_stock": r["current_stock"], "on_order_qty": r["on_order_qty"],
                "open_po_count": r["open_po_count"], "purchase_order_id": r["purchase_order_id"],
                "daily_demand_p50": round(r["forecast_p50"], 2), "demand_std": round(r["demand_std"], 2),
                "lead_time_days": round(r["lead_time"], 2), "lead_time_std": round(r["lead_time_std"], 2),
                "lead_time_sample_size": r["lead_time_sample_size"], "ved_class": r["ved_class"],
                "z_value": r["z_value"], "stockout_probability": round(r["stockout_probability"], 4),
                "pack_size": r["pack_size"], "moq_packs": r["moq_packs"],
                "supplier_id": r["supplier_id"], "supplier_name": r["supplier_name"],
            },
            "model_run_id": r["model_run_id"], "demand_model_run_id": r["demand_model_run_id"],
            "prediction_date": r["prediction_date"], "created_at": r["created_at"],
        } for r in rows],
    }
