"""Check the Phase 5 runtime queries: DB DataFrames pass through the unchanged features.py functions, no rows after
the prediction date are read, and receipts after it are hidden.

Usage (from backend/): python -m scripts.check_feature_inputs --cutoff 2025-11-30
"""

import argparse
import datetime
import time
import pandas as pd
from app.database.connection import engine
from app.ml.features import STOCKOUT_FEATURES, build_stockout_snapshots, build_weekly_demand
from app.services.feature_inputs import load_feature_inputs

DATE_COLUMNS = {"demand": "Demand_Date", "inventory": "date", "transfers": "transfer_date", "purchase_orders": "order_date"}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cutoff", type=datetime.date.fromisoformat, required=True)
    cutoff = parser.parse_args().cutoff

    start = time.perf_counter()
    with engine.connect() as conn:
        inputs = load_feature_inputs(conn, cutoff)
    as_of = pd.Timestamp(inputs["prediction_date"])
    print(f"data cutoff {cutoff}, prediction date {as_of.date()} (loaded in {time.perf_counter() - start:.1f}s)")

    for name, col in DATE_COLUMNS.items():
        df = inputs[name]
        latest = pd.to_datetime(df[col]).max()
        assert latest <= as_of, f"{name}: {col} {latest} is after {as_of}"
        print(f"  {name:16} {len(df):>9,} rows  columns={list(df.columns)}  max {col}={latest.date()}")
    po = inputs["purchase_orders"]
    assert (pd.to_datetime(po["receipt_date"]).dropna() <= as_of).all(), "receipt after prediction date"
    assert po.loc[po["receipt_date"].isna(), "lead_time_days"].isna().all(), "lead time of an open PO is known"
    print(f"  supplier_items   {len(inputs['supplier_items']):>9,} rows  columns={list(inputs['supplier_items'].columns)}")
    print(f"  open POs at prediction date: {po['receipt_date'].isna().sum()}")

    weekly = build_weekly_demand(inputs["demand"])
    assert weekly["week_start"].max() + pd.Timedelta(days=6) < as_of, "incomplete demand week"
    print(f"weekly demand: {len(weekly):,} rows, weeks {weekly['week_start'].min().date()} .. {weekly['week_start'].max().date()}")

    snaps = build_stockout_snapshots(inputs["inventory"], inputs["transfers"], inputs["purchase_orders"],
                                     inputs["supplier_items"], with_label=False)
    latest = snaps[snaps["date"] == as_of]
    assert snaps["date"].max() == as_of, f"latest snapshot {snaps['date'].max()} is not the prediction date"
    print(f"stockout snapshots: {len(snaps):,} rows, latest {as_of.date()}: {len(latest):,} store-items")
    print(f"  missing values in latest snapshot features: {latest[STOCKOUT_FEATURES].isna().sum()[lambda s: s > 0].to_dict()}")
    print("OK")


if __name__ == "__main__":
    main()
