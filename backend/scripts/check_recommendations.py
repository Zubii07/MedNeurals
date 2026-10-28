"""Phase 9 verification.

  --reference   Replay cutoff 2025-12-29 from the source CSVs (Phase 6 predictions -> build_recommendations) and compare
                item by item with the notebook output app/ml/trained/reorder_recommendations_latest.csv.
                --flat-z uses z = 1.65 for every item (what the notebook did) to check that all other rules reproduce
                the reference; without it the plan's VED z is used and the differences it causes are listed.
  --db          Check the latest saved recommendation set against independent SQL (central stock, open PO quantity,
                daily_inventory.on_order_qty, inventory position) and recompute SS / ROP / quantity with pandas.

Usage (from backend/):
  python -m scripts.check_recommendations --reference --flat-z
  python -m scripts.check_recommendations --reference
  python -m scripts.check_recommendations --db
"""

import argparse
import datetime
import math

import numpy as np
import pandas as pd
from sqlalchemy import text

from app.database.connection import engine
from app.ml.artifacts import get_artifacts
from app.services import recommendation_rules as rules
from app.services.predictions import run_predictions
from app.services.recommendations import Inputs, build_recommendations, latest_recommendation_run_id
from app.services.supplier_stats import ORDER_COLUMNS, compute_performance
from scripts.compare_predictions import CSV_DIR, REFERENCE_CSV, csv_inputs, read_csvs

CUTOFF = datetime.date(2025, 12, 29)
RANK = {"HIGH": 2, "MODERATE": 1, "LOW": 0}


def csv_recommendation_inputs(cutoff: datetime.date) -> Inputs:
    artifacts = get_artifacts()
    raw = read_csvs()
    run = run_predictions(csv_inputs(raw, cutoff), cutoff, artifacts)
    P = pd.Timestamp(run.prediction_date)
    m, t = CSV_DIR / "01_master", CSV_DIR / "02_transactions"

    mi = pd.read_csv(m / "medical_items.csv", usecols=["Item_ID", "VED_Class", "UOM_Per_Purchase_Pack"])
    si = pd.read_csv(m / "supplier_items.csv")
    pref = si[si["Preferred_Supplier_Flag"] == "Y"].groupby("Item_ID").agg(
        supplier_id=("Supplier_ID", "min"), moq_packs=("Minimum_Order_Quantity", "min"), preferred_count=("Supplier_ID", "size"))
    items = (mi.rename(columns={"Item_ID": "item_id", "VED_Class": "ved_class", "UOM_Per_Purchase_Pack": "pack_size"})
               .join(pref, on="item_id").fillna({"preferred_count": 0}))

    po = pd.read_csv(t / "purchase_orders.csv", parse_dates=["order_date", "expected_delivery_date", "receipt_date"])
    po = po[po["order_date"] <= P]
    lead = []
    for supplier_id, orders in po.groupby("supplier_id"):
        stats = compute_performance(orders[ORDER_COLUMNS], run.prediction_date)["lead_time"]
        lead.append({"supplier_id": supplier_id, "lead_time": stats["mean_days"], "lead_time_std": stats["std_dev_days"],
                     "lead_time_sample_size": stats["sample_size"]})

    inv = raw["inventory"]
    tr = pd.read_csv(t / "stock_transfers.csv", parse_dates=["transfer_date", "arrival_date"])
    tr = tr[(tr["transfer_date"] <= P) & (tr["arrival_date"] > P)]
    return Inputs(
        prediction_date=run.prediction_date,
        horizon_days=artifacts.stockout_horizon_days,
        threshold_review=artifacts.threshold_review,
        threshold_urgent=artifacts.threshold_urgent,
        items=items,
        forecasts=run.forecasts,
        stockout=run.stockout[["store_id", "item_id", "probability"]],
        lead_times=pd.DataFrame(lead),
        stock=inv[inv["date"] == P][["store_id", "item_id", "closing_qty"]],
        in_transit=(tr.groupby(["to_store_id", "item_id"])["shipped_qty"].sum().rename("in_transit_qty").reset_index()
                      .rename(columns={"to_store_id": "store_id"})),
        purchase_orders=po[["purchase_order_id", "item_id", "order_date", "expected_delivery_date", "receipt_date",
                            "ordered_quantity", "status"]],
    )


def item_view(rows: list[dict]) -> pd.DataFrame:
    """One row per item: TRANSFER items keep the highest-priority store row and the summed transfer quantity."""
    df = pd.DataFrame(rows)
    df["rank"] = df["priority"].map(RANK)
    first = df.sort_values(["item_id", "rank"], ascending=[True, False]).drop_duplicates("item_id").set_index("item_id")
    first["transfer_qty"] = df.groupby("item_id")["transfer_qty"].sum()
    return first


def check_reference(flat_z: bool) -> None:
    z = {k: 1.65 for k in rules.Z_BY_VED} if flat_z else rules.Z_BY_VED
    rows, skipped = build_recommendations(csv_recommendation_inputs(CUTOFF), z)
    ours = item_view(rows)
    ref = pd.read_csv(REFERENCE_CSV).set_index("Item_ID")
    print(f"z = {'flat 1.65 (notebook)' if flat_z else 'VED (plan)'}: {len(ours)} items, {len(rows)} rows, "
          f"{len(skipped)} skipped, reference {len(ref)} items")
    common = ref.index.intersection(ours.index)
    o, r = ours.loc[common], ref.loc[common]
    for ours_col, ref_col, tol in [("forecast_p50", "daily_demand_p50", 0.0051), ("demand_std", "daily_demand_std", 0.0051),
                                   ("lead_time", "lead_time", 0.0051), ("lead_time_std", "lead_time_std", 0.0051),
                                   ("safety_stock", "safety_stock", 0.0051), ("reorder_point", "reorder_point", 0.0051)]:
        diff = (o[ours_col].round(2) - r[ref_col]).abs()
        print(f"  {ours_col:18} max |diff| {diff.max():9.3f}   items > {tol}: {(diff > tol).sum()}")
    for ours_col, ref_col in [("inventory_position", "inventory_position"), ("recommended_quantity", "recommended_qty"),
                              ("action", "action"), ("priority", "priority")]:
        bad = o[ours_col] != r[ref_col]
        print(f"  {ours_col:18} mismatches {bad.sum()}")
        if bad.any():
            show = pd.DataFrame({"ours": o.loc[bad, ours_col], "reference": r.loc[bad, ref_col],
                                 "ved": o.loc[bad, "ved_class"], "prob_max": r.loc[bad, "stockout_prob_max"],
                                 "d_ours": o.loc[bad, "forecast_p50"].round(2), "d_ref": r.loc[bad, "daily_demand_p50"]})
            print(show.head(15).to_string(max_cols=10).replace("\n", "\n    "))
    print("  action counts ours", ours["action"].value_counts().to_dict(), "reference", ref["action"].value_counts().to_dict())


def check_db() -> None:
    with engine.connect() as conn:
        run_id = latest_recommendation_run_id(conn)
        if run_id is None:
            print("no recommendations in the DB")
            return
        rec = pd.read_sql(text("SELECT * FROM recommendations WHERE model_run_id = :id"), conn, params={"id": run_id})
        P = rec["prediction_date"].iloc[0]
        sql = pd.read_sql(text("""
            SELECT i.item_id, inv.closing_qty AS central, inv.on_order_qty AS inv_on_order,
                   coalesce(po.qty, 0) AS po_open_qty, coalesce(po.n, 0) AS po_open_count
            FROM medical_items i
            LEFT JOIN daily_inventory inv ON inv.item_id = i.item_id AND inv.store_id = 'STR-001' AND inv.date = :p
            LEFT JOIN (SELECT item_id, sum(ordered_quantity) AS qty, count(*) AS n FROM purchase_orders
                       WHERE order_date <= :p AND (receipt_date IS NULL OR receipt_date > :p)
                         AND lower(status) NOT LIKE 'cancel%' GROUP BY item_id) po ON po.item_id = i.item_id
        """), conn, params={"p": P}).set_index("item_id")
    items = rec.drop_duplicates("item_id").set_index("item_id").join(sql)
    print(f"run {run_id}, prediction date {P}: {len(rec)} rows, {len(items)} items, "
          f"actions {rec['action'].value_counts().to_dict()}")
    print(f"  current_stock == SQL central closing_qty       : {(items['current_stock'] == items['central']).mean():.0%}")
    print(f"  on_order_qty  == SQL open-PO quantity          : {(items['on_order_qty'] == items['po_open_qty']).mean():.0%}")
    print(f"  open_po_count == SQL open-PO count             : {(items['open_po_count'] == items['po_open_count']).mean():.0%}")
    print(f"  on_order_qty  == daily_inventory.on_order_qty  : {(items['on_order_qty'] == items['inv_on_order']).mean():.0%}")
    print(f"  inventory_position == central + open PO (SQL)  : "
          f"{(items['inventory_position'] == items['central'] + items['po_open_qty']).mean():.0%}")

    # pandas recomputation from the stored inputs
    ss = rec["z_value"] * np.sqrt(rec["lead_time"] * rec["demand_std"] ** 2 + rec["forecast_p50"] ** 2 * rec["lead_time_std"] ** 2)
    rop = rec["forecast_p50"] * rec["lead_time"] + ss
    target = rop + 7 * rec["forecast_p50"]
    need = (target - rec["inventory_position"]).clip(lower=0)
    packs = np.maximum(np.ceil(need / rec["pack_size"]), rec["moq_packs"].fillna(0))
    qty = np.where(rec["inventory_position"] < target, packs * rec["pack_size"], 0)
    purchase = rec["action"] == "PURCHASE"
    print(f"  safety_stock / reorder_point / order_up_to max |diff|: {(ss - rec['safety_stock']).abs().max():.2e} / "
          f"{(rop - rec['reorder_point']).abs().max():.2e} / {(target - rec['order_up_to_level']).abs().max():.2e}")
    print(f"  PURCHASE quantity recomputed equal          : {(qty[purchase] == rec.loc[purchase, 'recommended_quantity']).mean():.0%}")
    print(f"  PURCHASE iff IP < order-up-to                : {((rec['inventory_position'] < rec['order_up_to_level']) == purchase).mean():.0%}")
    print(f"  negative quantities                         : {((rec['recommended_quantity'] < 0) | (rec['transfer_qty'] < 0)).sum()}")
    transfer = rec[rec["action"] == "TRANSFER"].groupby("item_id").agg(total=("transfer_qty", "sum"), central=("current_stock", "first"))
    print(f"  TRANSFER totals within central stock        : {(transfer['total'] <= transfer['central']).mean():.0%} of {len(transfer)} items")
    print("\n  sample:")
    for action in ("PURCHASE", "TRANSFER", "EXPEDITE_PO", "NONE"):
        r = rec[rec["action"] == action].sort_values("stockout_probability", ascending=False).head(1)
        for row in r.itertuples():
            print(f"  [{row.action} {row.priority}] {row.item_id} {row.store_id or ''} qty {row.recommended_quantity} "
                  f"transfer {row.transfer_qty} SS {row.safety_stock:.1f} ROP {row.reorder_point:.1f} "
                  f"S {row.order_up_to_level:.1f} IP {row.inventory_position}\n      {row.reason}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reference", action="store_true")
    parser.add_argument("--flat-z", action="store_true")
    parser.add_argument("--db", action="store_true")
    args = parser.parse_args()
    if args.reference:
        check_reference(args.flat_z)
    if args.db:
        check_db()


if __name__ == "__main__":
    main()
