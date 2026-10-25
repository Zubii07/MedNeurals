"""Phase 6 verification: compare backend predictions with the notebook's reference output.

Three runs for one data cutoff:
  db        backend path: PostgreSQL queries (feature_inputs) -> run_predictions
  csv       same run_predictions, but inputs read from the source CSVs with the same as-of rules as the SQL queries
            (lets us check cutoffs the demo DB does not hold yet, e.g. 2025-12-29 while the DB stops at 2025-11-30)
  notebook  notebook cells 11 + 43 replayed: full CSVs, demand cap over the WHOLE dataset (as the notebook did),
            forecast(all_weeks=True), latest Monday snapshot

Item-level values are aggregated exactly like the notebook's reorder_recommendations():
  daily_demand_p50  = sum of P50 over stores and horizons / 28
  daily_demand_std  = (sum P90 - sum P50) / (1.28 * 28), clipped at 0
  stockout_prob_max = highest sub-store probability

Usage (from backend/):
  python -m scripts.compare_predictions --cutoff 2025-12-29                 csv + notebook vs reference CSV
  python -m scripts.compare_predictions --cutoff 2025-11-30 --db            also db vs csv, row by row
"""

import argparse
import datetime
import time
from pathlib import Path

import numpy as np
import pandas as pd

from app.database.connection import engine
from app.ml.artifacts import TRAINED_DIR, get_artifacts
from app.ml.features import build_stockout_snapshots, build_weekly_demand, forecast, stockout_probability
from app.services.feature_inputs import load_feature_inputs, prediction_date_for
from app.services.predictions import cap_demand_outliers, run_predictions

CSV_DIR = Path(__file__).resolve().parents[1] / "data" / "MedNeurals_dataset_v2"
REFERENCE_CSV = TRAINED_DIR / "reorder_recommendations_latest.csv"
REFERENCE_PREDICTION_DATE = datetime.date(2025, 12, 29)
ITEM_COLUMNS = ["daily_demand_p50", "daily_demand_std", "stockout_prob_max"]


def read_csvs() -> dict:
    t = CSV_DIR / "02_transactions"
    return {
        "demand": pd.read_csv(t / "demand.csv", usecols=["Demand_Date", "Store_ID", "Item_ID", "Demand_Quantity"],
                              parse_dates=["Demand_Date"]),
        "inventory": pd.read_csv(t / "daily_inventory.csv", parse_dates=["date"],
                                 usecols=["date", "store_id", "item_id", "demand_qty", "closing_qty", "on_order_qty", "is_stockout"]),
        "transfers": pd.read_csv(t / "stock_transfers.csv", parse_dates=["transfer_date"],
                                 usecols=["transfer_date", "to_store_id", "item_id", "shipped_qty"]),
        "purchase_orders": pd.read_csv(t / "purchase_orders.csv", parse_dates=["order_date", "expected_delivery_date", "receipt_date"],
                                       usecols=["purchase_order_id", "supplier_id", "item_id", "order_date", "expected_delivery_date",
                                                "receipt_date", "lead_time_days", "ordered_quantity", "is_emergency"]),
        "supplier_items": pd.read_csv(CSV_DIR / "01_master" / "supplier_items.csv",
                                      usecols=["Item_ID", "Supplier_ID", "Preferred_Supplier_Flag"]),
    }


def csv_inputs(raw: dict, cutoff: datetime.date) -> dict:
    """The CSVs filtered with the rules of app/services/feature_inputs.py."""
    as_of = pd.Timestamp(prediction_date_for(cutoff))
    po = raw["purchase_orders"][raw["purchase_orders"]["order_date"] <= as_of].copy()
    unknown = po["receipt_date"] > as_of
    po.loc[unknown, "receipt_date"] = pd.NaT
    po.loc[unknown | po["receipt_date"].isna(), "lead_time_days"] = np.nan
    return {
        "prediction_date": as_of.date(),
        "demand": raw["demand"][raw["demand"]["Demand_Date"] <= as_of],
        "inventory": raw["inventory"][raw["inventory"]["date"] <= as_of],
        "transfers": raw["transfers"][raw["transfers"]["transfer_date"] <= as_of],
        "purchase_orders": po,
        "supplier_items": raw["supplier_items"],
    }


def notebook_run(raw: dict, artifacts) -> tuple[pd.DataFrame, pd.DataFrame, pd.Timestamp]:
    """Notebook cells 11 + 43, prediction part only (full CSVs, no cutoff)."""
    weekly = build_weekly_demand(cap_demand_outliers(raw["demand"]))
    fc = forecast(artifacts.demand, weekly)
    latest = build_stockout_snapshots(raw["inventory"], raw["transfers"], raw["purchase_orders"], raw["supplier_items"],
                                      n_days=artifacts.stockout_horizon_days,
                                      forecasts=forecast(artifacts.demand, weekly, all_weeks=True), with_label=False)
    latest = latest[latest["date"] == latest["date"].max()]
    stockout = latest[["store_id", "item_id"]].assign(probability=stockout_probability(artifacts.stockout, latest))
    return fc.rename(columns={"Store_ID": "store_id", "Item_ID": "item_id"}), stockout, latest["date"].max()


def item_level(forecasts: pd.DataFrame, stockout: pd.DataFrame, n_horizons: int) -> pd.DataFrame:
    by_item = forecasts.groupby("item_id")[["p50", "p90"]].sum()
    out = pd.DataFrame({"daily_demand_p50": by_item["p50"] / (7 * n_horizons),
                        "daily_demand_std": ((by_item["p90"] - by_item["p50"]) / (1.28 * 7 * n_horizons)).clip(lower=0)})
    out["stockout_prob_max"] = out.index.map(stockout.groupby("item_id")["probability"].max()).fillna(0)
    return out


def compare_items(name: str, ours: pd.DataFrame, reference: pd.DataFrame) -> None:
    """Reference values are rounded to 2 decimals, so |diff| <= 0.005 (+ float noise) counts as a match."""
    common = reference.index.intersection(ours.index)
    print(f"\n{name} vs reference CSV: {len(common)} common items (ours {len(ours)}, reference {len(reference)})")
    for col in ITEM_COLUMNS:
        diff = (ours.loc[common, col].round(2) - reference.loc[common, col]).abs()
        bad = diff[diff > 0.0051]
        print(f"  {col:18} max |diff| {diff.max():.4f}  mismatches (>0.005 after rounding) {len(bad)}"
              + (f"  e.g. {bad.sort_values(ascending=False).head(3).round(3).to_dict()}" if len(bad) else ""))


def compare_rows(name: str, a: pd.DataFrame, b: pd.DataFrame, keys: list[str], cols: list[str]) -> None:
    m = a.merge(b, on=keys, how="outer", suffixes=("_a", "_b"), indicator=True)
    only = (m["_merge"] != "both").sum()
    print(f"\n{name}: {len(a)} vs {len(b)} rows, {only} rows only on one side")
    for col in cols:
        print(f"  {col:12} max |diff| {(m[f'{col}_a'] - m[f'{col}_b']).abs().max():.3e}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cutoff", type=datetime.date.fromisoformat, required=True)
    parser.add_argument("--db", action="store_true", help="also run from PostgreSQL and compare with the csv run")
    args = parser.parse_args()

    artifacts = get_artifacts()
    print(f"demand model {artifacts.demand_model_name} v{artifacts.demand_model_version}, stockout model "
          f"{artifacts.stockout_model_name} v{artifacts.stockout_model_version}, thresholds review "
          f"{artifacts.threshold_review} / urgent {artifacts.threshold_urgent}")
    start = time.perf_counter()
    raw = read_csvs()
    csv_run = run_predictions(csv_inputs(raw, args.cutoff), args.cutoff, artifacts)
    print(f"csv run: prediction date {csv_run.prediction_date}, forecast from week {csv_run.forecast_week_start}, "
          f"{len(csv_run.forecasts)} forecasts, {len(csv_run.stockout)} stockout rows "
          f"({time.perf_counter() - start:.0f}s)")
    print(f"  risk levels: {csv_run.stockout['risk_level'].value_counts().to_dict()}")

    if args.db:
        start = time.perf_counter()
        with engine.connect() as conn:
            db_run = run_predictions(load_feature_inputs(conn, args.cutoff), args.cutoff, artifacts)
        print(f"db run: prediction date {db_run.prediction_date} ({time.perf_counter() - start:.0f}s)")
        keys = ["store_id", "item_id"]
        compare_rows("db vs csv forecasts", db_run.forecasts, csv_run.forecasts, keys + ["horizon", "target_week"], ["p50", "p90"])
        compare_rows("db vs csv stockout", db_run.stockout, csv_run.stockout, keys, ["probability"])
        print(f"  risk level differences: {(db_run.stockout['risk_level'] != csv_run.stockout['risk_level']).sum()}")

    if csv_run.prediction_date == REFERENCE_PREDICTION_DATE:
        reference = pd.read_csv(REFERENCE_CSV).set_index("Item_ID")
        n = len(artifacts.horizons)
        compare_items("csv run (backend logic)", item_level(csv_run.forecasts, csv_run.stockout, n), reference)
        nb_fc, nb_stockout, nb_date = notebook_run(raw, artifacts)
        print(f"\nnotebook replay: snapshot {nb_date.date()}, forecast from week {nb_fc['week_start'].max().date()}")
        compare_items("notebook replay", item_level(nb_fc, nb_stockout, n), reference)
        compare_rows("csv run vs notebook replay, forecasts", csv_run.forecasts,
                     nb_fc.assign(target_week=nb_fc["target_week"].dt.date)[["store_id", "item_id", "horizon", "target_week", "p50", "p90"]],
                     ["store_id", "item_id", "horizon", "target_week"], ["p50", "p90"])
        compare_rows("csv run vs notebook replay, stockout", csv_run.stockout, nb_stockout, ["store_id", "item_id"], ["probability"])


if __name__ == "__main__":
    main()
