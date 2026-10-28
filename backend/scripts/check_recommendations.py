import argparse

import numpy as np
import pandas as pd
from sqlalchemy import text

from app.database.connection import engine
from app.services.recommendations import latest_recommendation_run_id


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-run-id", type=int, help="stockout run of a refresh (default: latest with recommendations)")
    args = parser.parse_args()

    with engine.connect() as conn:
        run_id = args.model_run_id or latest_recommendation_run_id(conn)
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
    item_rows = rec[rec["store_id"].isna()]
    transfers = rec[rec["action"] == "TRANSFER"]
    print(f"run {run_id}, prediction date {P}: {len(rec)} rows, {len(items)} items, "
          f"item rows {item_rows['action'].value_counts().to_dict()}, "
          f"TRANSFER rows {len(transfers)} for {transfers['item_id'].nunique()} items")
    check = lambda label, ok: print(f"  {label:48} {ok.mean():.0%}")
    check("current_stock == SQL central closing_qty", items["current_stock"] == items["central"])
    check("on_order_qty == SQL open-PO quantity", items["on_order_qty"] == items["po_open_qty"])
    check("open_po_count == SQL open-PO count", items["open_po_count"] == items["po_open_count"])
    check("on_order_qty == daily_inventory.on_order_qty", items["on_order_qty"] == items["inv_on_order"])
    check("inventory_position == central + open PO (SQL)", items["inventory_position"] == items["central"] + items["po_open_qty"])

    # pandas recomputation from the stored inputs
    ss = rec["z_value"] * np.sqrt(rec["lead_time"] * rec["demand_std"] ** 2 + rec["forecast_p50"] ** 2 * rec["lead_time_std"] ** 2)
    rop = rec["forecast_p50"] * rec["lead_time"] + ss
    target = rop + 7 * rec["forecast_p50"]
    print(f"  SS / ROP / order-up-to max |diff|                {(ss - rec['safety_stock']).abs().max():.1e} / "
          f"{(rop - rec['reorder_point']).abs().max():.1e} / {(target - rec['order_up_to_level']).abs().max():.1e}")
    purchase = item_rows[item_rows["action"] == "PURCHASE"]
    packs = np.maximum(np.ceil((purchase["order_up_to_level"] - purchase["inventory_position"]) / purchase["pack_size"]),
                       purchase["moq_packs"].fillna(0))
    check("PURCHASE quantity recomputed equal", packs * purchase["pack_size"] == purchase["recommended_quantity"])
    below = items["inventory_position"] < items["order_up_to_level"]
    has_purchase = items.index.isin(purchase["item_id"])
    check("PURCHASE row iff IP < order-up-to", below == has_purchase)
    check("each item has an item row or TRANSFER rows",
          pd.Series(items.index.isin(item_rows["item_id"]) | items.index.isin(transfers["item_id"])))
    print(f"  negative quantities                              {((rec['recommended_quantity'] < 0) | (rec['transfer_qty'] < 0)).sum()}")
    per_item = transfers.groupby("item_id").agg(total=("transfer_qty", "sum"), central=("current_stock", "first"))
    check("TRANSFER totals within central stock", per_item["total"] <= per_item["central"])
    check("TRANSFER quantities > 0", transfers["transfer_qty"] > 0)

    print("\n  sample:")
    for action in ("PURCHASE", "TRANSFER", "EXPEDITE_PO", "NONE"):
        for row in rec[rec["action"] == action].sort_values("stockout_probability", ascending=False).head(1).itertuples():
            print(f"  [{row.action} {row.priority}] {row.item_id} {row.store_id or ''} purchase {row.recommended_quantity} "
                  f"transfer {row.transfer_qty} SS {row.safety_stock:.1f} ROP {row.reorder_point:.1f} "
                  f"S {row.order_up_to_level:.1f} IP {row.inventory_position}\n      {row.reason}")


if __name__ == "__main__":
    main()
