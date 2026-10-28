"""Recommendation engine: one completed prediction refresh + inventory / PO / supplier data on its prediction date ->
rows in `recommendations` (formulas and rules in app/services/recommendation_rules.py).

Inputs, all as known on the run's prediction date P (never later data):
- forecasts and stockout probabilities of the run (the stockout run and the demand_forecast run it used)
- central (STR-001) and sub-store closing_qty on P (daily_inventory), transfers shipped by P that arrive after P
- purchase orders ordered by P (open ones = not received by P, not cancelled)
- preferred supplier, its MOQ (packs) and the item's pack size; lead time mean / std of the supplier's routine orders
  received by P (Phase 8 compute_performance)

An item whose inputs are incomplete gets no row; it is reported as skipped with the reason (in the response only:
the schema has no table for skips). A run's set is written once
and never changed; generating again for the same run returns the existing set.
"""

import datetime
import math
from dataclasses import dataclass

import pandas as pd
from sqlalchemy import func, insert, select, text
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.exc import IntegrityError

from app.ml.features import CENTRAL_STORE
from app.models.predictions import MODEL_TYPE_DEMAND, MODEL_TYPE_STOCKOUT, ModelRun, RUN_COMPLETED
from app.models.recommendations import (
    ACTION_EXPEDITE,
    ACTION_NONE,
    ACTION_PURCHASE,
    ACTION_TRANSFER,
    Recommendation,
)
from app.services import recommendation_rules as rules
from app.services.model_runs import latest_completed_run_id
from app.services.supplier_stats import compute_performance, supplier_orders

runs = ModelRun.__table__
recommendations = Recommendation.__table__


class RecommendationError(Exception):
    """The run cannot be turned into recommendations (incomplete or inconsistent)."""


class RunNotFound(RecommendationError):
    pass


@dataclass
class Inputs:
    prediction_date: datetime.date
    horizon_days: int                  # stockout horizon (14); transfers cover the P90 forecast of these days
    threshold_review: float
    threshold_urgent: float
    items: pd.DataFrame                # item_id, ved_class, pack_size, supplier_id, moq_packs, preferred_count
    forecasts: pd.DataFrame            # store_id, item_id, horizon, p50, p90
    stockout: pd.DataFrame             # store_id, item_id, probability
    lead_times: pd.DataFrame           # supplier_id, lead_time, lead_time_std, lead_time_sample_size
    stock: pd.DataFrame                # store_id, item_id, closing_qty on P (central and sub-stores)
    in_transit: pd.DataFrame           # store_id, item_id, in_transit_qty
    purchase_orders: pd.DataFrame      # purchase_order_id, item_id, order_date, expected_delivery_date, receipt_date,
                                       # ordered_quantity, status


# ---------------------------------------------------------------- reasons (short, plain language; numbers in details)

def _n(x: float) -> str:
    return f"{x:,.0f}"


def _units(qty: int) -> str:
    return "unit" if qty == 1 else "units"


def purchase_reason(ip, rop, target, qty, packs, pack, moq_packs, moq_applied, n_transfers) -> str:
    if ip < rop:
        why = f"Stock plus open orders ({_n(ip)}) is below the reorder point ({_n(rop)})."
    else:
        why = f"Stock plus open orders ({_n(ip)}) will not last until the next weekly review (target {_n(target)})."
    text_ = f"{why} Order {_n(qty)} {_units(qty)} ({packs} packs of {pack}"
    text_ += f", supplier minimum {moq_packs} packs)." if moq_applied else ")."
    if n_transfers:
        text_ += f" Transfers to {n_transfers} at-risk sub-store(s) are listed separately."
    return text_


def expedite_reason(at_risk_need, central, po, prediction_date, n_transfers) -> str:
    expected = po["expected_delivery_date"].date()
    days = (expected - prediction_date).days
    when = f"was due on {expected}, {-days} days ago" if days < 0 else f"is expected on {expected}"
    text_ = (f"At-risk sub-stores need {_n(at_risk_need)} units soon but the central store has {_n(central)}. "
             f"Ask the supplier to expedite open order {po['purchase_order_id']} ({_n(po['ordered_quantity'])} units), "
             f"which {when}.")
    if n_transfers:
        text_ += " Transfer the central stock that is available (listed separately)."
    return text_


def transfer_reason(store, prob, horizon_days, on_hand, in_transit, p90, need, qty) -> str:
    text_ = (f"{store} may run out within {horizon_days} days (risk {prob:.0%}): its stock ({_n(on_hand + in_transit)} "
             f"incl. in transit) is below expected demand ({_n(p90)}). Transfer {_n(qty)} {_units(qty)} from the central store.")
    if qty < need:
        text_ += f" Central stock covers only {_n(qty)} of the {_n(need)} needed."
    return text_


def none_reason(ip, target, prob, store, review, at_risk_need) -> str:
    covered = f"Stock plus open orders ({_n(ip)}) covers expected demand (target {_n(target)})"
    if prob < review:
        return f"{covered} and no sub-store is at risk of running out."
    if at_risk_need <= 0:
        return f"{covered}. {store} shows some stockout risk ({prob:.0%}), but its stock already covers expected demand."
    return f"{covered}. {store} is at risk ({prob:.0%}), but the central store is empty and no order is open; review manually."


# ---------------------------------------------------------------- calculation

def build_recommendations(inputs: Inputs) -> tuple[list[dict], list[dict]]:
    """Pure pandas: (rows for `recommendations` without run columns, skipped [{item_id, reason}])."""
    P = inputs.prediction_date
    required = set(rules.FORECAST_HORIZONS)
    forecast_days = 7 * len(required)
    transfer_weeks = math.ceil(inputs.horizon_days / 7)

    forecasts = inputs.forecasts[inputs.forecasts["store_id"] != CENTRAL_STORE]     # demand happens at sub-stores
    item_horizons = forecasts.groupby("item_id")["horizon"].agg(set)
    fc_item = forecasts.groupby("item_id")[["p50", "p90"]].sum()
    fc_store = forecasts[forecasts["horizon"] <= transfer_weeks].groupby(["store_id", "item_id"])["p90"].sum()
    stockout = inputs.stockout.sort_values(["item_id", "probability", "store_id"], ascending=[True, False, True])
    stock = inputs.stock.set_index(["store_id", "item_id"])["closing_qty"]
    in_transit = inputs.in_transit.set_index(["store_id", "item_id"])["in_transit_qty"]
    lead = inputs.lead_times.set_index("supplier_id")
    po = rules.open_purchase_orders(inputs.purchase_orders, P)
    po = po.assign(expected_delivery_date=pd.to_datetime(po["expected_delivery_date"])).sort_values(
        ["expected_delivery_date", "purchase_order_id"])
    po_by_item = {item: g for item, g in po.groupby("item_id")}

    rows, skipped = [], []
    for item in inputs.items.itertuples():
        item_id = item.item_id

        def skip(reason):
            skipped.append({"item_id": item_id, "reason": reason})

        if item_id not in fc_item.index:
            skip("no demand forecast for this item in the forecast run"); continue
        if item_horizons.at[item_id] != required:
            missing = sorted(required - item_horizons.at[item_id])
            skip(f"forecast is missing horizon(s) {missing} of {sorted(required)}; daily demand needs all four"); continue
        item_risk = stockout[stockout["item_id"] == item_id]
        if item_risk.empty:
            skip("no stockout prediction for this item in the stockout run"); continue
        if item.preferred_count != 1 or pd.isna(item.supplier_id):
            skip(f"{int(item.preferred_count)} preferred suppliers in supplier_items (need exactly 1)"); continue
        if item.supplier_id not in lead.index or pd.isna(lead.at[item.supplier_id, "lead_time"]):
            skip(f"supplier {item.supplier_id} has no completed routine orders by {P} (no lead time)"); continue
        if pd.isna(lead.at[item.supplier_id, "lead_time_std"]):
            skip(f"supplier {item.supplier_id} has fewer than 2 completed routine orders by {P} (no lead-time variability)"); continue
        if item.ved_class not in rules.Z_BY_VED:
            skip(f"unknown VED class {item.ved_class!r}"); continue
        if pd.isna(item.pack_size) or item.pack_size < 1:
            skip(f"invalid pack size {item.pack_size!r} in medical_items"); continue
        if (CENTRAL_STORE, item_id) not in stock.index:
            skip(f"no central-store inventory snapshot on {P}"); continue

        z = rules.Z_BY_VED[item.ved_class]
        L = float(lead.at[item.supplier_id, "lead_time"])
        sL = float(lead.at[item.supplier_id, "lead_time_std"])
        d = rules.daily_demand(fc_item.at[item_id, "p50"], forecast_days)
        sd = rules.demand_std(fc_item.at[item_id, "p50"], fc_item.at[item_id, "p90"], forecast_days)
        ss = rules.safety_stock(z, d, sd, L, sL)
        rop = rules.reorder_point(d, L, ss)
        target = rules.order_up_to_level(rop, d)
        central = int(stock.at[(CENTRAL_STORE, item_id)])
        item_po = po_by_item.get(item_id, po.iloc[0:0])
        on_order = int(item_po["ordered_quantity"].sum())
        ip = rules.inventory_position(central, on_order)
        pack = int(item.pack_size)
        moq = int(item.moq_packs) if pd.notna(item.moq_packs) else None
        top = item_risk.iloc[0]
        prob, top_store = float(top["probability"]), top["store_id"]

        # at-risk sub-stores (highest probability first) and what central stock can give them
        needs = []
        for r in item_risk[item_risk["probability"] >= inputs.threshold_review].itertuples():
            key = (r.store_id, item_id)
            if key not in stock.index:
                skip(f"no inventory snapshot for sub-store {r.store_id} on {P}; no transfer calculated for it"); continue
            on_hand, transit = int(stock.at[key]), int(in_transit.get(key, 0))     # no shipment row = nothing in transit
            p90 = float(fc_store.get(key, 0.0))
            needs.append((r.store_id, float(r.probability), on_hand, transit, p90,
                          rules.store_transfer_need(p90, on_hand, transit)))
        at_risk_need = sum(n[-1] for n in needs)
        allocated = rules.allocate_transfers(central, [n[-1] for n in needs])
        transfers = [(n, qty) for n, qty in zip(needs, allocated) if qty > 0]

        base = {
            "item_id": item_id, "supplier_id": item.supplier_id, "store_id": None, "purchase_order_id": None,
            "ved_class": item.ved_class, "z_value": z, "forecast_p50": d, "demand_std": sd,
            "lead_time": L, "lead_time_std": sL,
            "lead_time_sample_size": int(lead.at[item.supplier_id, "lead_time_sample_size"]),
            "current_stock": central, "on_order_qty": on_order, "open_po_count": len(item_po),
            "stockout_probability": prob, "pack_size": pack, "moq_packs": moq, "inventory_position": ip,
            "safety_stock": ss, "reorder_point": rop, "order_up_to_level": target,
            "recommended_quantity": 0, "transfer_qty": 0,
            "priority": rules.priority(prob, inputs.threshold_review, inputs.threshold_urgent, item.ved_class, ip, rop),
        }

        action = rules.item_action(ip, target, at_risk_need, central, len(item_po), bool(transfers))
        if action == ACTION_PURCHASE:
            qty, packs, moq_applied = rules.purchase_quantity(target, ip, pack, moq)
            rows.append({**base, "action": action, "recommended_quantity": qty, "reason": purchase_reason(
                ip, rop, target, qty, packs, pack, moq, moq_applied, len(transfers))})
        elif action == ACTION_EXPEDITE:
            first = item_po.iloc[0]
            rows.append({**base, "action": action, "purchase_order_id": first["purchase_order_id"],
                         "reason": expedite_reason(at_risk_need, central, first, P, len(transfers))})
        elif action == ACTION_NONE:
            rows.append({**base, "action": action,
                         "reason": none_reason(ip, target, prob, top_store, inputs.threshold_review, at_risk_need)})

        for (store, p, on_hand, transit, p90, need), qty in transfers:
            rows.append({**base, "action": ACTION_TRANSFER, "store_id": store, "stockout_probability": p,
                         "transfer_qty": qty,
                         "priority": rules.priority(p, inputs.threshold_review, inputs.threshold_urgent,
                                                    item.ved_class, ip, rop),
                         "reason": transfer_reason(store, p, inputs.horizon_days, on_hand, transit, p90, need, qty)})
    return rows, skipped


# database

def _read(conn: Connection, sql: str, **params) -> pd.DataFrame:
    return pd.read_sql(text(sql), conn, params=params)


def _run_pair(conn: Connection, stockout_run_id: int | None):
    """The stockout run (default: latest completed refresh) and its demand_forecast run, checked for consistency."""
    if stockout_run_id is None:
        stockout_run_id = latest_completed_run_id(conn)
        if stockout_run_id is None:
            raise RunNotFound("no completed prediction run; call POST /predictions/refresh first")
    run = conn.execute(select(runs).where(runs.c.id == stockout_run_id)).one_or_none()
    if run is None:
        raise RunNotFound(f"model run {stockout_run_id} not found")
    if run.model_type != MODEL_TYPE_STOCKOUT:
        raise RecommendationError(f"model run {run.id} is a {run.model_type} run; pass the stockout run of a refresh")
    if run.status != RUN_COMPLETED:
        raise RecommendationError(f"stockout run {run.id} is {run.status}, not completed")
    demand = conn.execute(select(runs).where(runs.c.id == run.demand_model_run_id)).one_or_none()
    if demand is None or demand.model_type != MODEL_TYPE_DEMAND or demand.status != RUN_COMPLETED:
        raise RecommendationError(f"stockout run {run.id} has no completed demand_forecast run")
    if (demand.prediction_date, demand.data_cutoff_date) != (run.prediction_date, run.data_cutoff_date):
        raise RecommendationError(f"runs {demand.id} and {run.id} have different prediction dates or data cutoffs")
    return run, demand


def load_inputs(conn: Connection, run, demand_run) -> Inputs:
    P = run.prediction_date
    forecasts = _read(conn, "SELECT store_id, item_id, horizon, p50, p90 FROM forecast_predictions WHERE model_run_id = :id",
                      id=demand_run.id)
    stockout = _read(conn, """SELECT store_id, item_id, probability, horizon_days, threshold_review, threshold_urgent
                              FROM stockout_predictions WHERE model_run_id = :id""", id=run.id)
    if forecasts.empty:
        raise RecommendationError(f"forecast run {demand_run.id} has no forecast rows")
    if stockout.empty:
        raise RecommendationError(f"stockout run {run.id} has no stockout prediction rows")
    settings = stockout[["horizon_days", "threshold_review", "threshold_urgent"]].drop_duplicates()
    if len(settings) != 1:
        raise RecommendationError(f"stockout run {run.id} mixes horizons or thresholds")

    items = _read(conn, """
        SELECT i.item_id, i.ved_class, i.uom_per_purchase_pack AS pack_size,
               min(si.supplier_id) AS supplier_id, min(si.minimum_order_quantity) AS moq_packs,
               count(si.supplier_id) AS preferred_count
        FROM medical_items i
        LEFT JOIN supplier_items si ON si.item_id = i.item_id AND si.preferred_supplier_flag
        GROUP BY i.item_id, i.ved_class, i.uom_per_purchase_pack
        ORDER BY i.item_id
    """)
    lead_rows = []
    for supplier_id in sorted(items["supplier_id"].dropna().unique()):
        stats = compute_performance(supplier_orders(conn, supplier_id, P), P)["lead_time"]
        lead_rows.append({"supplier_id": supplier_id, "lead_time": stats["mean_days"],
                          "lead_time_std": stats["std_dev_days"], "lead_time_sample_size": stats["sample_size"]})
    s = settings.iloc[0]
    return Inputs(
        prediction_date=P,
        horizon_days=int(s["horizon_days"]),
        threshold_review=float(s["threshold_review"]),
        threshold_urgent=float(s["threshold_urgent"]),
        items=items,
        forecasts=forecasts,
        stockout=stockout[["store_id", "item_id", "probability"]],
        lead_times=pd.DataFrame(lead_rows, columns=["supplier_id", "lead_time", "lead_time_std", "lead_time_sample_size"]),
        stock=_read(conn, "SELECT store_id, item_id, closing_qty FROM daily_inventory WHERE date = :p", p=P),
        in_transit=_read(conn, """
            SELECT to_store_id AS store_id, item_id, sum(shipped_qty) AS in_transit_qty
            FROM stock_transfers WHERE transfer_date <= :p AND arrival_date > :p
            GROUP BY to_store_id, item_id""", p=P),
        purchase_orders=_read(conn, """
            SELECT purchase_order_id, item_id, order_date, expected_delivery_date, receipt_date, ordered_quantity, status
            FROM purchase_orders WHERE order_date <= :p""", p=P),
    )


def summary(conn: Connection, run, demand_run, created: bool, skipped: list[dict] | None = None) -> dict:
    rows = conn.execute(select(recommendations.c.item_id, recommendations.c.action, recommendations.c.priority,
                               recommendations.c.created_at)
                        .where(recommendations.c.model_run_id == run.id)).all()
    item_total = conn.execute(text("SELECT count(*) FROM medical_items")).scalar()
    items = {r.item_id for r in rows}
    count = lambda field: {k: sum(1 for r in rows if getattr(r, field) == k) for k in sorted({getattr(r, field) for r in rows})}
    return {
        "model_run_id": run.id,
        "demand_model_run_id": demand_run.id,
        "prediction_date": run.prediction_date,
        "data_cutoff_date": run.data_cutoff_date,
        "created": created,
        "generated_at": min((r.created_at for r in rows), default=None),
        "row_count": len(rows),
        "item_count": len(items),
        "action_counts": count("action"),
        "priority_counts": count("priority"),
        "skipped_count": item_total - len(items),
        "skipped": skipped,
    }


def generate_recommendations(engine: Engine, stockout_run_id: int | None = None) -> dict:
    """Recommendations for one completed refresh (default: the latest). Idempotent: a run that already has a set
    returns it unchanged (created=False)."""
    with engine.connect().execution_options(isolation_level="REPEATABLE READ") as conn:
        run, demand_run = _run_pair(conn, stockout_run_id)
        if conn.execute(select(func.count()).where(recommendations.c.model_run_id == run.id)).scalar():
            return summary(conn, run, demand_run, created=False)
        rows, skipped = build_recommendations(load_inputs(conn, run, demand_run))
    if not rows:
        raise RecommendationError(f"no item has complete inputs for run {run.id}; skipped: {skipped[:5]}")

    trace = {"model_run_id": run.id, "demand_model_run_id": demand_run.id,
             "prediction_date": run.prediction_date, "data_cutoff_date": run.data_cutoff_date}
    try:
        with engine.begin() as conn:
            conn.execute(insert(recommendations), [{**trace, **r} for r in rows])
    except IntegrityError:
        # a concurrent call wrote the set first (unique model_run_id, item_id, store_id): return that one
        with engine.connect() as conn:
            if not conn.execute(select(func.count()).where(recommendations.c.model_run_id == run.id)).scalar():
                raise
            return summary(conn, run, demand_run, created=False)
    with engine.connect() as conn:
        return summary(conn, run, demand_run, created=True, skipped=skipped)


def latest_recommendation_run_id(conn: Connection) -> int | None:
    """The stockout run of the newest refresh that has recommendations."""
    return conn.execute(text("""
        SELECT r.model_run_id FROM recommendations r JOIN model_runs m ON m.id = r.model_run_id
        GROUP BY r.model_run_id, m.completed_at
        ORDER BY m.completed_at DESC, r.model_run_id DESC LIMIT 1""")).scalar()
