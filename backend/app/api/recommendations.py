from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import insert, text, update
from sqlalchemy.exc import IntegrityError

from app.api.deps import require_admin, require_officer
from app.api.reads import pagination
from app.database.connection import engine
from app.models.decisions import DECISION_ADJUSTED, RecommendationDecision
from app.models.recommendations import ACTION_EXPEDITE, ACTION_NONE, ACTION_PURCHASE, STATUS_PENDING, Recommendation
from app.models.user import User
from app.schemas.recommendations import (
    DecisionHistoryPage,
    DecisionRequest,
    RecommendationPage,
    RecommendationRow,
    RecommendationSummary,
)
from app.services.model_runs import latest_completed_run_id
from app.services.recommendations import (
    RecommendationError,
    RunNotFound,
    generate_recommendations,
    latest_recommendation_run_id,
)

router = APIRouter(prefix="/recommendations", tags=["recommendations"])

PRIORITY_ORDER = "CASE r.priority WHEN 'HIGH' THEN 0 WHEN 'MODERATE' THEN 1 ELSE 2 END"
# Saved recommendation rows with their item, store and supplier names and the officer's decision, if any; callers
# add the WHERE clause.
ROW_QUERY = """
    SELECT r.*, i.item_name, i.uom, st.store_name, s.supplier_name,
           po.expected_delivery_date AS po_expected_delivery_date, po.receipt_date AS po_receipt_date,
           d.id AS decision_id, d.decision, d.user_id AS decided_by_id, u.name AS decided_by_name, d.decided_at,
           d.original_quantity, d.adjusted_quantity, d.original_expected_date, d.adjusted_expected_date,
           d.reason AS decision_reason
    FROM recommendations r
    JOIN medical_items i ON i.item_id = r.item_id
    JOIN suppliers s ON s.supplier_id = r.supplier_id
    LEFT JOIN stores st ON st.store_id = r.store_id
    LEFT JOIN purchase_orders po ON po.purchase_order_id = r.purchase_order_id
    LEFT JOIN recommendation_decisions d ON d.recommendation_id = r.id
    LEFT JOIN users u ON u.id = d.user_id"""
ROW_ORDER = f"{PRIORITY_ORDER}, r.stockout_probability DESC, r.item_id, r.store_id, r.id"

# Decisions with the recommendation they were made on, newest first; callers add the WHERE clause.
HISTORY_QUERY = """
    SELECT d.id, d.recommendation_id, d.decision, d.user_id AS decided_by_id, u.name AS decided_by_name, d.decided_at,
           d.original_quantity, d.adjusted_quantity, d.original_expected_date, d.adjusted_expected_date, d.reason,
           r.item_id, i.item_name, i.uom, r.store_id, st.store_name, r.action, r.priority,
           r.recommended_quantity, r.transfer_qty, r.purchase_order_id, r.model_run_id, r.prediction_date
    FROM recommendation_decisions d
    JOIN recommendations r ON r.id = d.recommendation_id
    JOIN users u ON u.id = d.user_id
    JOIN medical_items i ON i.item_id = r.item_id
    LEFT JOIN stores st ON st.store_id = r.store_id"""
HISTORY_ORDER = "d.decided_at DESC, d.id DESC"

decisions = RecommendationDecision.__table__
recommendations = Recommendation.__table__


def decision_out(r) -> dict | None:
    """The officer's decision of a ROW_QUERY row, or None while the row is pending."""
    if r["decision_id"] is None:
        return None
    return {
        "id": r["decision_id"], "recommendation_id": r["id"], "decision": r["decision"],
        "decided_by_id": r["decided_by_id"], "decided_by_name": r["decided_by_name"], "decided_at": r["decided_at"],
        "original_quantity": r["original_quantity"], "adjusted_quantity": r["adjusted_quantity"],
        "original_expected_date": r["original_expected_date"], "adjusted_expected_date": r["adjusted_expected_date"],
        "reason": r["decision_reason"],
    }


def recommendation_row(r) -> dict:
    """One saved row as returned by the API (RecommendationRow). Values are read as stored, never recalculated."""
    return {
        "id": r["id"], "product_id": r["item_id"], "product_name": r["item_name"], "unit": r["uom"],
        "store_id": r["store_id"], "store_name": r["store_name"], "action": r["action"], "priority": r["priority"],
        "recommended_purchase_quantity": r["recommended_quantity"], "transfer_quantity": r["transfer_qty"],
        "safety_stock": round(r["safety_stock"], 2), "reorder_point": round(r["reorder_point"], 2),
        "order_up_to_level": round(r["order_up_to_level"], 2), "inventory_position": r["inventory_position"],
        "reason": r["reason"], "status": r["status"], "decision": decision_out(r),
        "details": {
            "current_stock": r["current_stock"], "on_order_qty": r["on_order_qty"],
            "open_po_count": r["open_po_count"], "purchase_order_id": r["purchase_order_id"],
            # live facts of the PO to expedite (read-only join; not part of the saved recommendation)
            "purchase_order_expected_delivery_date": r["po_expected_delivery_date"],
            "purchase_order_received": None if r["purchase_order_id"] is None else r["po_receipt_date"] is not None,
            "daily_demand_p50": round(r["forecast_p50"], 2), "demand_std": round(r["demand_std"], 2),
            "lead_time_days": round(r["lead_time"], 2), "lead_time_std": round(r["lead_time_std"], 2),
            "lead_time_sample_size": r["lead_time_sample_size"], "ved_class": r["ved_class"],
            "z_value": r["z_value"], "stockout_probability": round(r["stockout_probability"], 4),
            "pack_size": r["pack_size"], "moq_packs": r["moq_packs"],
            "supplier_id": r["supplier_id"], "supplier_name": r["supplier_name"],
        },
        "model_run_id": r["model_run_id"], "demand_model_run_id": r["demand_model_run_id"],
        "prediction_date": r["prediction_date"], "data_cutoff_date": r["data_cutoff_date"], "created_at": r["created_at"],
    }


def history_row(r) -> dict:
    return {
        "id": r["id"], "recommendation_id": r["recommendation_id"], "decision": r["decision"],
        "decided_by_id": r["decided_by_id"], "decided_by_name": r["decided_by_name"], "decided_at": r["decided_at"],
        "original_quantity": r["original_quantity"], "adjusted_quantity": r["adjusted_quantity"],
        "original_expected_date": r["original_expected_date"], "adjusted_expected_date": r["adjusted_expected_date"],
        "reason": r["reason"],
        "product_id": r["item_id"], "product_name": r["item_name"], "unit": r["uom"],
        "store_id": r["store_id"], "store_name": r["store_name"], "action": r["action"], "priority": r["priority"],
        "recommended_purchase_quantity": r["recommended_quantity"], "transfer_quantity": r["transfer_qty"],
        "purchase_order_id": r["purchase_order_id"], "model_run_id": r["model_run_id"], "prediction_date": r["prediction_date"],
    }


@router.post("/refresh", response_model=RecommendationSummary, dependencies=[Depends(require_admin)])
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
    status: Literal["PENDING", "ACCEPTED", "ADJUSTED", "REJECTED"] | None = None,
    item_id: str | None = None,
    store_id: str | None = None,
    page: dict[str, int] = Depends(pagination),
):
    """One recommendation set, most urgent first."""
    with engine.connect() as conn:
        latest_set = latest_recommendation_run_id(conn)
        if model_run_id is None:
            model_run_id = latest_set
            if model_run_id is None:
                raise HTTPException(status_code=404, detail="no recommendations yet; call POST /recommendations/refresh")
        run = conn.execute(text("""SELECT model_run_id, demand_model_run_id, prediction_date, data_cutoff_date,
                                          min(created_at) AS generated_at
                                   FROM recommendations WHERE model_run_id = :id
                                   GROUP BY model_run_id, demand_model_run_id, prediction_date, data_cutoff_date"""),
                           {"id": model_run_id}).one_or_none()
        if run is None:
            raise HTTPException(status_code=404, detail=f"no recommendations for model run {model_run_id}")

        where = ["r.model_run_id = :run"]
        params = {"run": model_run_id, **page}
        for name, value in (("action", action), ("priority", priority), ("status", status), ("item_id", item_id),
                            ("store_id", store_id)):
            if value:
                where.append(f"r.{name} = :{name}")
                params[name] = value
        latest_run = latest_completed_run_id(conn)
        latest_date = conn.execute(text("SELECT prediction_date FROM model_runs WHERE id = :id"), {"id": latest_run}).scalar()
        condition = " AND ".join(where)
        total = conn.execute(text(f"SELECT count(*) FROM recommendations r WHERE {condition}"), params).scalar()
        rows = conn.execute(text(f"{ROW_QUERY} WHERE {condition} ORDER BY {ROW_ORDER} LIMIT :limit OFFSET :offset"),
                            params).mappings().all()
        counts = conn.execute(text("SELECT status, count(*) AS n FROM recommendations WHERE model_run_id = :run GROUP BY status"),
                              {"run": model_run_id}).all()

    return {
        **run._mapping, "latest_prediction_run_id": latest_run, "latest_prediction_date": latest_date,
        "freshness": "current" if model_run_id == latest_run else "stale",
        "is_latest_set": model_run_id == latest_set,
        "status_counts": {s: 0 for s in ("PENDING", "ACCEPTED", "ADJUSTED", "REJECTED")} | {c.status: c.n for c in counts},
        "total": total, **page,
        "items": [recommendation_row(r) for r in rows],
    }


@router.get("/decisions", response_model=DecisionHistoryPage)
def list_decisions(
    item_id: str | None = None,
    store_id: str | None = Query(None, description="TRANSFER rows of this sub-store"),
    decision: Literal["ACCEPTED", "ADJUSTED", "REJECTED"] | None = None,
    action: Literal["PURCHASE", "TRANSFER", "EXPEDITE_PO", "NONE"] | None = None,
    user_id: int | None = Query(None, description="Decisions by this officer"),
    page: dict[str, int] = Depends(pagination),
):
    """Every officer decision, newest first, across all recommendation sets (both roles may read it)."""
    where, params = ["TRUE"], {**page}
    for column, name, value in (("r.item_id", "item_id", item_id), ("r.store_id", "store_id", store_id),
                                ("d.decision", "decision", decision), ("r.action", "action", action),
                                ("d.user_id", "user_id", user_id)):
        if value is not None and value != "":
            where.append(f"{column} = :{name}")
            params[name] = value
    condition = " AND ".join(where)
    with engine.connect() as conn:
        total = conn.execute(text(f"SELECT count(*) FROM recommendation_decisions d JOIN recommendations r "
                                  f"ON r.id = d.recommendation_id WHERE {condition}"), params).scalar()
        rows = conn.execute(text(f"{HISTORY_QUERY} WHERE {condition} ORDER BY {HISTORY_ORDER} LIMIT :limit OFFSET :offset"),
                            params).mappings().all()
    return {"total": total, **page, "items": [history_row(r) for r in rows]}


def _invalid(detail: str) -> HTTPException:
    return HTTPException(status_code=422, detail=detail)


def decision_values(row, body: DecisionRequest) -> dict:
    """The original and adjusted values to store for this row's action, or a 422 when the request does not fit it.
    PURCHASE / TRANSFER rows are adjusted by quantity, EXPEDITE_PO rows by the requested delivery date, NONE rows
    cannot be adjusted (there is nothing to change: accept or reject them)."""
    action = row["action"]
    if action == ACTION_EXPEDITE:
        if body.adjusted_quantity is not None:
            raise _invalid("An expedite recommendation is adjusted by its delivery date, not by a quantity")
        original = row["po_expected_delivery_date"]
        if body.decision == DECISION_ADJUSTED:
            if body.adjusted_expected_date is None:
                raise _invalid("Enter the delivery date you want to ask the supplier for")
            if body.adjusted_expected_date <= row["prediction_date"]:
                raise _invalid(f"The requested delivery date must be after the prediction date ({row['prediction_date']})")
            if body.adjusted_expected_date == original:
                raise _invalid("The requested delivery date is the same as the supplier's expected date")
        return {"original_expected_date": original, "adjusted_expected_date": body.adjusted_expected_date}
    if body.adjusted_expected_date is not None:
        raise _invalid("Only an expedite recommendation has a delivery date to adjust")
    if action == ACTION_NONE:
        if body.decision == DECISION_ADJUSTED:
            raise _invalid("A 'no action' recommendation has nothing to adjust; accept it or reject it")
        return {}
    original = row["recommended_quantity"] if action == ACTION_PURCHASE else row["transfer_qty"]
    if body.decision == DECISION_ADJUSTED:
        if body.adjusted_quantity is None:
            raise _invalid("Enter the adjusted quantity")
        if body.adjusted_quantity == original:
            raise _invalid("The adjusted quantity is the same as the recommended quantity")
    return {"original_quantity": original, "adjusted_quantity": body.adjusted_quantity}


@router.post("/{recommendation_id}/decision", response_model=RecommendationRow)
def decide(recommendation_id: int, body: DecisionRequest, officer: User = Depends(require_officer)):
    """The officer's Accept / Adjust / Reject on one pending row of the latest recommendation set (CLAUDE.md rule 4:
    this records a decision, it never places an order or moves stock). Writes the decision row and the row's status
    in one transaction. The row is locked while it is checked, so a second click waits and then gets the 409."""
    with engine.begin() as conn:
        row = conn.execute(text("""
            SELECT r.id, r.model_run_id, r.action, r.status, r.recommended_quantity, r.transfer_qty, r.prediction_date,
                   po.expected_delivery_date AS po_expected_delivery_date
            FROM recommendations r
            LEFT JOIN purchase_orders po ON po.purchase_order_id = r.purchase_order_id
            WHERE r.id = :id FOR UPDATE OF r"""), {"id": recommendation_id}).mappings().one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail=f"Recommendation {recommendation_id} not found")
        if row["status"] != STATUS_PENDING:
            raise HTTPException(status_code=409, detail="This recommendation has already been decided")
        if row["model_run_id"] != latest_recommendation_run_id(conn):
            raise HTTPException(status_code=409, detail="This recommendation belongs to an older set; only the latest "
                                                        "recommendations can be decided")
        values = decision_values(row, body)
        try:
            conn.execute(insert(decisions).values(recommendation_id=recommendation_id, user_id=officer.id,
                                                  decision=body.decision, reason=body.reason, **values))
        except IntegrityError:
            raise HTTPException(status_code=409, detail="This recommendation has already been decided") from None
        conn.execute(update(recommendations).where(recommendations.c.id == recommendation_id).values(status=body.decision))

    with engine.connect() as conn:
        saved = conn.execute(text(f"{ROW_QUERY} WHERE r.id = :id"), {"id": recommendation_id}).mappings().one()
    return recommendation_row(saved)
