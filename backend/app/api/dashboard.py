from typing import Literal

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.api.reads import pagination
from app.api.recommendations import ROW_ORDER, ROW_QUERY, recommendation_row
from app.database.connection import engine
from app.ml.features import CENTRAL_STORE
from app.schemas.dashboard import DashboardSummary, ForecastPage, ProductAnalysis, StockoutRiskPage
from app.services.model_runs import latest_completed_run_id, latest_data_cutoff, run_status
from app.services.recommendation_rules import open_purchase_orders
from app.services.recommendations import latest_recommendation_run_id
from app.services.supplier_stats import compute_performance, supplier_orders

router = APIRouter(tags=["dashboard"])

RISK_RANK = "CASE {} WHEN 'URGENT' THEN 0 WHEN 'REVIEW' THEN 1 ELSE 2 END"
PRIORITY_RANK = "CASE {} WHEN 'HIGH' THEN 0 WHEN 'MODERATE' THEN 1 ELSE 2 END"
NO_RUN = "no successful prediction run yet; call POST /predictions/refresh"

FORECAST_QUERY = """
    SELECT f.item_id, i.item_name, i.uom AS unit, f.store_id, s.store_name, f.horizon, f.target_week, f.p50, f.p90,
           f.model_run_id
    FROM forecast_predictions f
    JOIN medical_items i ON i.item_id = f.item_id
    JOIN stores s ON s.store_id = f.store_id"""
STOCKOUT_QUERY = """
    SELECT p.item_id, i.item_name, p.store_id, s.store_name, p.probability, p.risk_level, p.horizon_days,
           p.threshold_review, p.threshold_urgent, p.model_run_id
    FROM stockout_predictions p
    JOIN medical_items i ON i.item_id = p.item_id
    JOIN stores s ON s.store_id = p.store_id"""


def _latest_run(conn: Connection) -> dict | None:
    run_id = latest_completed_run_id(conn)
    return None if run_id is None else run_status(conn, run_id)


def _recommendation_set(conn: Connection, run: dict | None) -> dict:
    run_id = run["stockout"]["model_run_id"] if run else None
    generated_at = conn.execute(text("SELECT min(created_at) FROM recommendations WHERE model_run_id = :id"),
                                {"id": run_id}).scalar() if run_id else None
    return {
        "status": "current" if generated_at else "missing",
        "model_run_id": run_id if generated_at else None,
        "generated_at": generated_at,
        "latest_available_model_run_id": latest_recommendation_run_id(conn),
    }


def _check_filters(conn: Connection, item_id: str | None, store_id: str | None) -> None:
    if item_id and conn.execute(text("SELECT 1 FROM medical_items WHERE item_id = :id"), {"id": item_id}).scalar() is None:
        raise HTTPException(status_code=404, detail=f"Product {item_id} not found")
    if store_id and conn.execute(text("SELECT 1 FROM stores WHERE store_id = :id"), {"id": store_id}).scalar() is None:
        raise HTTPException(status_code=404, detail=f"Store {store_id} not found")


def _page(conn: Connection, query: str, order: str, where: dict, page: dict[str, int]) -> tuple[int, list]:
    """total and one page of `query` filtered by `where` ({column: value}, None values ignored)."""
    where = {column: value for column, value in where.items() if value is not None}
    condition = " AND ".join(f"{column} = :p{n}" for n, column in enumerate(where))
    params = {f"p{n}": value for n, value in enumerate(where.values())} | page
    total = conn.execute(text(f"SELECT count(*) FROM ({query} WHERE {condition}) t"), params).scalar()
    rows = conn.execute(text(f"{query} WHERE {condition} ORDER BY {order} LIMIT :limit OFFSET :offset"), params)
    return total, [dict(r) for r in rows.mappings()]


@router.get("/dashboard/summary", response_model=DashboardSummary)
def dashboard_summary():
    """Dashboard cards from the latest successful prediction run and its recommendation set. Items are counted once
    (worst sub-store / highest-priority row), never once per store or horizon."""
    with engine.connect() as conn:
        total_items = conn.execute(text("SELECT count(*) FROM medical_items")).scalar()
        run = _latest_run(conn)
        rec_set = _recommendation_set(conn, run)
        summary = {
            "total_items": total_items, "latest_data_date": latest_data_cutoff(conn),
            "latest_prediction_timestamp": None, "model_versions": None, "prediction_run": run,
            "stockout_risk_counts": None, "items_without_stockout_prediction": None,
            "recommendation_set": rec_set, "recommendation_priority_counts": None, "items_needing_attention": None,
        }
        if run is None:
            return summary

        risk = dict(conn.execute(text(f"""
            SELECT worst, count(*) FROM (
                SELECT item_id, min({RISK_RANK.format('risk_level')}) AS worst
                FROM stockout_predictions WHERE model_run_id = :id GROUP BY item_id) t
            GROUP BY worst"""), {"id": run["stockout"]["model_run_id"]}).all())
        summary.update({
            "latest_prediction_timestamp": run["completed_at"],
            "model_versions": {r["model_type"]: r["model_version"] for r in (run["demand_forecast"], run["stockout"])},
            "stockout_risk_counts": {level: risk.get(rank, 0) for rank, level in enumerate(("URGENT", "REVIEW", "LOW"))},
            "items_without_stockout_prediction": total_items - sum(risk.values()),
        })
        if rec_set["status"] == "current":
            per_item = conn.execute(text(f"""
                SELECT top, count(*) AS items, count(*) FILTER (WHERE attention) AS attention FROM (
                    SELECT item_id, min({PRIORITY_RANK.format('priority')}) AS top,
                           bool_or(action <> 'NONE' OR priority <> 'LOW') AS attention
                    FROM recommendations WHERE model_run_id = :id GROUP BY item_id) t
                GROUP BY top"""), {"id": rec_set["model_run_id"]}).all()
            counts = {r.top: r.items for r in per_item}
            summary["recommendation_priority_counts"] = {
                p: counts.get(rank, 0) for rank, p in enumerate(("HIGH", "MODERATE", "LOW"))}
            summary["items_needing_attention"] = sum(r.attention for r in per_item)
    return summary


@router.get("/forecasts", response_model=ForecastPage, tags=["predictions"])
def list_forecasts(
    item_id: str | None = None,
    store_id: str | None = None,
    horizon: int | None = Query(None, ge=1, le=4, description="1-4 (H1-H4)"),
    page: dict[str, int] = Depends(pagination),
):
    """Saved demand forecasts of the latest successful prediction run, ordered by item, store, horizon."""
    with engine.connect() as conn:
        run = _latest_run(conn)
        if run is None:
            raise HTTPException(status_code=404, detail=NO_RUN)
        _check_filters(conn, item_id, store_id)
        total, rows = _page(conn, FORECAST_QUERY, "f.item_id, f.store_id, f.horizon", {
            "f.model_run_id": run["demand_forecast"]["model_run_id"], "f.item_id": item_id, "f.store_id": store_id,
            "f.horizon": horizon}, page)
    return {"run": run, "total": total, **page, "items": rows}


@router.get("/stockout-risks", response_model=StockoutRiskPage, tags=["predictions"])
def list_stockout_risks(
    item_id: str | None = None,
    store_id: str | None = None,
    risk_level: Literal["URGENT", "REVIEW", "LOW"] | None = None,
    page: dict[str, int] = Depends(pagination),
):
    """Saved stockout predictions (one per sub-store and item) of the latest successful prediction run, highest
    probability first."""
    with engine.connect() as conn:
        run = _latest_run(conn)
        if run is None:
            raise HTTPException(status_code=404, detail=NO_RUN)
        _check_filters(conn, item_id, store_id)
        total, rows = _page(conn, STOCKOUT_QUERY, "p.probability DESC, p.item_id, p.store_id", {
            "p.model_run_id": run["stockout"]["model_run_id"], "p.item_id": item_id, "p.store_id": store_id,
            "p.risk_level": risk_level}, page)
    return {"run": run, "total": total, **page, "items": rows}


def _current_stock(conn: Connection, item_id: str) -> dict | None:
    rows = conn.execute(text("""
        SELECT d.date, d.store_id, s.store_name, d.closing_qty
        FROM daily_inventory d JOIN stores s ON s.store_id = d.store_id
        WHERE d.item_id = :id AND d.date = (SELECT max(date) FROM daily_inventory WHERE item_id = :id)
        ORDER BY d.store_id"""), {"id": item_id}).mappings()
    rows = [dict(r) for r in rows]
    if not rows:
        return None
    return {
        "as_of_date": rows[0]["date"],
        "central_store_qty": next((r["closing_qty"] for r in rows if r["store_id"] == CENTRAL_STORE), None),
        "total_qty": sum(r["closing_qty"] for r in rows),
        "by_store": rows,
    }


def _open_orders(conn: Connection, item_id: str, as_of) -> dict:
    po = pd.read_sql(text("""
        SELECT purchase_order_id, supplier_id, order_date, expected_delivery_date, receipt_date, ordered_quantity, status
        FROM purchase_orders WHERE item_id = :id AND order_date <= :as_of
        ORDER BY expected_delivery_date, purchase_order_id"""), conn, params={"id": item_id, "as_of": as_of})
    open_po = open_purchase_orders(po, as_of)      # the same open-order rule the recommendation engine uses
    return {"as_of_date": as_of, "quantity": int(open_po["ordered_quantity"].sum()),
            "orders": open_po.drop(columns=["receipt_date", "status"]).to_dict("records")}


def _preferred_suppliers(conn: Connection, item_id: str, as_of) -> list[dict]:
    suppliers = conn.execute(text("""
        SELECT si.supplier_id, s.supplier_name, si.minimum_order_quantity, si.lead_time_days AS contract_lead_time_days
        FROM supplier_items si JOIN suppliers s ON s.supplier_id = si.supplier_id
        WHERE si.item_id = :id AND si.preferred_supplier_flag ORDER BY si.supplier_id"""), {"id": item_id}).mappings()
    out = []
    for s in suppliers:
        stats = compute_performance(supplier_orders(conn, s["supplier_id"], as_of), as_of)
        out.append({**s, "as_of": as_of, "lead_time": stats["lead_time"],
                    "on_time_rate": stats["on_time_delivery"]["rate"], "fill_rate": stats["fill_rate"]["rate"]})
    return out


@router.get("/products/{item_id}/analysis", response_model=ProductAnalysis, tags=["products"])
def product_analysis(item_id: str):
    """One item: saved forecasts, stockout risks and recommendation of the latest successful prediction run, plus
    contextual live data (current stock, open purchase orders, preferred supplier statistics). Nothing is
    recalculated: recommendation values are the persisted Phase 9 rows."""
    with engine.connect() as conn:
        item = conn.execute(text("SELECT * FROM medical_items WHERE item_id = :id"), {"id": item_id}).mappings().one_or_none()
        if item is None:
            raise HTTPException(status_code=404, detail=f"Product {item_id} not found")
        stock = _current_stock(conn, item_id)
        result = {
            "item": dict(item), "prediction_run": None, "forecast": None, "stockout_risk": None, "recommendation": None,
            "current_stock": stock,
            "open_purchase_orders": _open_orders(conn, item_id, stock["as_of_date"]) if stock else None,
        }
        run = _latest_run(conn)
        result["preferred_suppliers"] = _preferred_suppliers(conn, item_id, run["prediction_date"] if run else None)
        if run is None:
            return result

        forecasts = conn.execute(text(f"{FORECAST_QUERY} WHERE f.model_run_id = :run AND f.item_id = :id "
                                      "ORDER BY f.horizon, f.store_id"),
                                 {"run": run["demand_forecast"]["model_run_id"], "id": item_id}).mappings()
        forecasts = [dict(f) for f in forecasts]
        totals = {}
        for f in forecasts:
            t = totals.setdefault(f["horizon"], {"horizon": f["horizon"], "target_week": f["target_week"],
                                                 "p50": 0.0, "p90_sum": 0.0})
            t["p50"] += f["p50"]
            t["p90_sum"] += f["p90"]
        risks = conn.execute(text(f"{STOCKOUT_QUERY} WHERE p.model_run_id = :run AND p.item_id = :id "
                                  "ORDER BY p.probability DESC, p.store_id"),
                             {"run": run["stockout"]["model_run_id"], "id": item_id}).mappings()
        risks = [dict(r) for r in risks]

        rec_set = _recommendation_set(conn, run)
        rows = []
        if rec_set["status"] == "current":
            rows = conn.execute(text(f"{ROW_QUERY} WHERE r.model_run_id = :run AND r.item_id = :id ORDER BY {ROW_ORDER}"),
                                {"run": rec_set["model_run_id"], "id": item_id}).mappings().all()
        result.update({
            "prediction_run": run,
            "forecast": {"totals": list(totals.values()), "by_store": forecasts},
            "stockout_risk": {"highest": risks[0] if risks else None, "by_store": risks},
            "recommendation": {
                "recommendation_set": rec_set,
                "item_status": "set_missing" if rec_set["status"] == "missing" else
                               "available" if rows else "item_not_included",
                "rows": [recommendation_row(r) for r in rows],
            },
        })
    return result
