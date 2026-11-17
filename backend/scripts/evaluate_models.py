"""Evaluate the two trained models on the 2025 hold-out period. Inference only: nothing is retrained, no artifact or
feature code is touched. The notebook's set-up is replayed through app/ml/features.py and app.ml.artifacts.

Reads only data/MedNeurals_dataset_v2/{01_master,02_transactions}/*.csv and app/ml/trained/*.joblib.
Splits follow app/ml/trained/metrics.json: train <= 2024-06-30, validation <= 2024-12-31, test = 2025.

Sections (all printed as Markdown tables so they can be pasted into docs/MODEL_EVALUATION.md):
  1. Demand forecast bias per horizon, per item (top 10 |relative bias|), per Demand_Archetype and Seasonality_Profile,
     P90 coverage, and WAPE/MASE of two baselines (seasonal naive = same week last year, 4-week moving average).
  2. Stockout model vs simple rules (days_of_cover < 14, cover_incl_transit < 14, cover_vs_forecast < 1) and vs a
     logistic regression fitted on the same 17 features using snapshots dated <= 2024-12-31 only.
  3. Calibration reliability table of the calibrated model on 2025 (fixed probability bins).

Usage (from backend/, several minutes of compute, ~4 GB RAM):
  .venv/Scripts/python -m scripts.evaluate_models
  .venv/Scripts/python -m scripts.evaluate_models --cache <dir>   # pickles the slow intermediates for re-runs
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import FunctionTransformer, StandardScaler

from app.ml.artifacts import TRAINED_DIR, load_artifacts
from app.ml.features import CENTRAL_STORE, STOCKOUT_FEATURES, build_stockout_snapshots, build_weekly_demand, forecast, stockout_probability
from app.services.predictions import cap_demand_outliers

BACKEND_DIR = Path(__file__).resolve().parents[1]
CSV_DIR = BACKEND_DIR / "data" / "MedNeurals_dataset_v2"
TEST_START = pd.Timestamp("2025-01-01")
VAL_END = pd.Timestamp("2024-12-31")
CALIBRATION_BINS = [0.0, 0.05, 0.10, 0.20, 0.30, 0.50, 0.70, 0.90, 1.0000001]
CALIBRATION_LABELS = ["0-5%", "5-10%", "10-20%", "20-30%", "30-50%", "50-70%", "70-90%", "90-100%"]

_t0 = time.perf_counter()


def log(msg: str) -> None:
    print(f"[{time.perf_counter() - _t0:6.0f}s] {msg}", flush=True)


def md_table(df: pd.DataFrame, floatfmt: str = "{:.4f}") -> str:
    """Markdown table without the tabulate dependency. Index is written as the first column when it is named."""
    d = df.reset_index() if df.index.name is not None or isinstance(df.index, pd.MultiIndex) else df
    cols = [str(c) for c in d.columns]

    def fmt(v):
        if isinstance(v, (float, np.floating)):
            return "" if np.isnan(v) else floatfmt.format(v)
        if isinstance(v, (int, np.integer)):
            return f"{v:,}"
        return str(v)

    lines = ["| " + " | ".join(cols) + " |", "|" + "|".join("---" for _ in cols) + "|"]
    for row in d.astype(object).itertuples(index=False):      # astype(object) keeps ints as ints next to floats
        lines.append("| " + " | ".join(fmt(v) for v in row) + " |")
    return "\n".join(lines)


def section(title: str) -> None:
    print(f"\n\n## {title}\n", flush=True)


# ----------------------------------------------------------------------------------------------------------------------
# loading
# ----------------------------------------------------------------------------------------------------------------------
def read_demand() -> pd.DataFrame:
    d = pd.read_csv(CSV_DIR / "02_transactions" / "demand.csv",
                    usecols=["Demand_Date", "Store_ID", "Item_ID", "Demand_Quantity"],
                    dtype={"Store_ID": "string", "Item_ID": "string", "Demand_Quantity": "float64"})
    d["Demand_Date"] = pd.to_datetime(d["Demand_Date"])
    d = d[d["Store_ID"] != CENTRAL_STORE]
    return d


def read_stockout_inputs() -> dict:
    t = CSV_DIR / "02_transactions"
    inv = pd.read_csv(t / "daily_inventory.csv",
                      usecols=["date", "store_id", "item_id", "demand_qty", "closing_qty", "on_order_qty", "is_stockout"],
                      dtype={"store_id": "string", "item_id": "string", "demand_qty": "float32", "closing_qty": "float32",
                             "on_order_qty": "float32", "is_stockout": "int8"})
    inv["date"] = pd.to_datetime(inv["date"])
    transfers = pd.read_csv(t / "stock_transfers.csv", usecols=["transfer_date", "to_store_id", "item_id", "shipped_qty"],
                            parse_dates=["transfer_date"])
    po = pd.read_csv(t / "purchase_orders.csv", parse_dates=["order_date", "expected_delivery_date", "receipt_date"],
                     usecols=["purchase_order_id", "supplier_id", "item_id", "order_date", "expected_delivery_date",
                              "receipt_date", "lead_time_days", "ordered_quantity", "is_emergency"])
    supplier_items = pd.read_csv(CSV_DIR / "01_master" / "supplier_items.csv",
                                 usecols=["Item_ID", "Supplier_ID", "Preferred_Supplier_Flag"])
    return {"inventory": inv, "transfers": transfers, "purchase_orders": po, "supplier_items": supplier_items}


def read_items() -> pd.DataFrame:
    items = pd.read_csv(CSV_DIR / "01_master" / "medical_items.csv",
                        usecols=["Item_ID", "Item_Name", "Demand_Archetype", "Seasonality_Profile"], dtype="string")
    items["Seasonality_Profile"] = items["Seasonality_Profile"].fillna("").str.strip()
    # profiles look like "dengue:.35" or "flood:1.2"; the word before the colon is the seasonal driver
    items["Seasonality_Family"] = items["Seasonality_Profile"].str.split(":").str[0].replace("", "none")
    return items


def cached(cache: Path | None, name: str, build):
    if cache is not None:
        p = cache / f"{name}.pkl"
        if p.exists():
            log(f"loading cached {name}")
            return pd.read_pickle(p)
    out = build()
    if cache is not None:
        cache.mkdir(parents=True, exist_ok=True)
        pd.to_pickle(out, cache / f"{name}.pkl")
    return out


# ----------------------------------------------------------------------------------------------------------------------
# 1. demand forecast
# ----------------------------------------------------------------------------------------------------------------------
def wape(actual: pd.Series, pred: pd.Series) -> float:
    return float((pred - actual).abs().sum() / actual.abs().sum())


def demand_eval_frame(artifact: dict, weekly: pd.DataFrame) -> pd.DataFrame:
    """Forecast rows for every origin week with the actual demand of the target week and the two baselines.
    Test rows = target week in 2025 (the forecast is made from the preceding week, which may be late 2024)."""
    fc = forecast(artifact, weekly, all_weeks=True)
    w = weekly.sort_values(["Store_ID", "Item_ID", "week_start"]).copy()
    g = w.groupby(["Store_ID", "Item_ID"])["demand_qty"]
    w["ma_4"] = g.transform(lambda x: x.rolling(4).mean())           # 4-week moving average at the forecast origin
    w["lag_1"] = w["demand_qty"]                                      # last completed week (one-step naive)
    actual = w[["Store_ID", "Item_ID", "week_start", "demand_qty"]].rename(columns={"week_start": "target_week", "demand_qty": "actual"})
    fc = fc.merge(actual, on=["Store_ID", "Item_ID", "target_week"], how="inner")
    fc = fc.merge(w[["Store_ID", "Item_ID", "week_start", "ma_4", "lag_1"]], on=["Store_ID", "Item_ID", "week_start"], how="left")
    last_year = actual.assign(target_week=actual["target_week"] + pd.Timedelta(weeks=52)).rename(columns={"actual": "seasonal_naive"})
    fc = fc.merge(last_year, on=["Store_ID", "Item_ID", "target_week"], how="left")
    fc["error"] = fc["p50"] - fc["actual"]
    return fc


def demand_section(artifact: dict, ev: pd.DataFrame, items: pd.DataFrame, metrics: dict) -> None:
    test = ev[ev["target_week"] >= TEST_START].copy()
    section("1. Demand forecast (2025 target weeks)")
    print(f"Rows: {len(test):,} store-item-week-horizon forecasts, {test['target_week'].nunique()} target weeks "
          f"({test['target_week'].min().date()} .. {test['target_week'].max().date()}), "
          f"{test.groupby(['Store_ID', 'Item_ID']).ngroups:,} store-item series. "
          f"Actuals are the capped weekly demand the model was trained on.\n")

    # --- per horizon: bias, accuracy, P90 coverage, baselines
    rows = []
    for h, d in test.groupby("horizon"):
        naive_mae = (d["lag_1"] - d["actual"]).abs().mean()          # MASE scale: one-step naive on the same rows
        ok = d["seasonal_naive"].notna()
        rows.append({
            "horizon": int(h),
            "n": len(d),
            "mean_error (P50-actual)": d["error"].mean(),
            "mean_actual": d["actual"].mean(),
            "sum(P50)/sum(actual)": d["p50"].sum() / d["actual"].sum(),
            "share_over": (d["error"] > 0).mean(),
            "share_under": (d["error"] < 0).mean(),
            "share_within_1_unit": (d["error"].abs() <= 1).mean(),
            "MAE": d["error"].abs().mean(),
            "WAPE": wape(d["actual"], d["p50"]),
            "MASE": d["error"].abs().mean() / naive_mae,
            "P90_coverage": (d["actual"] <= d["p90"]).mean(),
            "metrics.json MAE": metrics["demand_forecast"]["test_2025"][f"h{int(h)}"]["MAE"],
            "metrics.json WAPE": metrics["demand_forecast"]["test_2025"][f"h{int(h)}"]["WAPE"],
            "metrics.json P90_coverage": metrics["demand_forecast"]["test_2025"][f"h{int(h)}"]["P90_coverage"],
        })
    per_h = pd.DataFrame(rows).set_index("horizon")
    print("### 1a. Bias and accuracy per horizon (model P50/P90)\n")
    print(md_table(per_h[["n", "mean_actual", "mean_error (P50-actual)", "sum(P50)/sum(actual)", "share_over", "share_under",
                          "share_within_1_unit", "P90_coverage"]]))
    print("\n### 1b. Model vs baselines per horizon (WAPE, MASE scaled by the one-step naive MAE on the same rows)\n")
    rows = []
    for h, d in test.groupby("horizon"):
        naive_mae = (d["lag_1"] - d["actual"]).abs().mean()
        ok = d["seasonal_naive"].notna()
        rows.append({
            "horizon": int(h),
            "model WAPE": wape(d["actual"], d["p50"]),
            "model MASE": d["error"].abs().mean() / naive_mae,
            "model bias ratio": d["p50"].sum() / d["actual"].sum(),
            "seasonal-naive WAPE": wape(d.loc[ok, "actual"], d.loc[ok, "seasonal_naive"]),
            "seasonal-naive MASE": (d.loc[ok, "seasonal_naive"] - d.loc[ok, "actual"]).abs().mean() / naive_mae,
            "seasonal-naive bias ratio": d.loc[ok, "seasonal_naive"].sum() / d.loc[ok, "actual"].sum(),
            "MA4 WAPE": wape(d["actual"], d["ma_4"]),
            "MA4 MASE": (d["ma_4"] - d["actual"]).abs().mean() / naive_mae,
            "MA4 bias ratio": d["ma_4"].sum() / d["actual"].sum(),
            "metrics.json model WAPE": metrics["demand_forecast"]["test_2025"][f"h{int(h)}"]["WAPE"],
            "metrics.json model MASE": metrics["demand_forecast"]["test_2025"][f"h{int(h)}"]["MASE"],
            "metrics.json seasonal-naive WAPE": metrics["demand_forecast"]["test_2025"][f"h{int(h)}"]["seasonal_naive_WAPE"],
        })
    print(md_table(pd.DataFrame(rows).set_index("horizon")))
    print(f"\nSeasonal-naive rows with a same-week-last-year value: {test['seasonal_naive'].notna().mean():.1%} of test rows.")

    # --- bias by item (all horizons pooled)
    print("\n### 1c. Items with the largest absolute relative bias (all horizons pooled)\n")
    by_item = test.groupby("Item_ID").agg(sum_p50=("p50", "sum"), sum_actual=("actual", "sum"), n=("actual", "size"),
                                          mae=("error", lambda e: e.abs().mean()))
    by_item["relative_bias"] = (by_item["sum_p50"] - by_item["sum_actual"]) / by_item["sum_actual"].replace(0, np.nan)
    by_item["share_of_total_demand"] = by_item["sum_actual"] / by_item["sum_actual"].sum()
    by_item["mean_weekly_actual"] = by_item["sum_actual"] / by_item["n"]
    by_item = by_item.join(items.set_index("Item_ID")[["Item_Name", "Demand_Archetype", "Seasonality_Profile"]])
    worst = by_item.reindex(by_item["relative_bias"].abs().sort_values(ascending=False).index).head(10)
    print(md_table(worst[["Item_Name", "Demand_Archetype", "Seasonality_Profile", "mean_weekly_actual", "sum_actual", "sum_p50",
                          "relative_bias", "share_of_total_demand"]].rename_axis("Item_ID"), floatfmt="{:.3f}"))
    abs_bias = by_item["relative_bias"].abs()
    print(f"\nAcross all {len(by_item)} items: median |relative bias| {abs_bias.median():.3f}, "
          f"{(abs_bias > 0.10).sum()} items beyond +/-10% (together {by_item.loc[abs_bias > 0.10, 'share_of_total_demand'].sum():.2%} of 2025 demand), "
          f"{(abs_bias > 0.25).sum()} beyond +/-25% ({by_item.loc[abs_bias > 0.25, 'share_of_total_demand'].sum():.2%} of demand); "
          f"{(by_item['relative_bias'] > 0).sum()} items over-forecast, {(by_item['relative_bias'] < 0).sum()} under-forecast. "
          f"Demand-weighted mean relative bias: {(by_item['sum_p50'].sum() - by_item['sum_actual'].sum()) / by_item['sum_actual'].sum():+.4f}.")
    print("\nLargest absolute relative bias among items averaging at least 5 units per store-week:\n")
    material = by_item[by_item["mean_weekly_actual"] >= 5]
    worst_m = material.reindex(material["relative_bias"].abs().sort_values(ascending=False).index).head(10)
    print(md_table(worst_m[["Item_Name", "Demand_Archetype", "Seasonality_Profile", "mean_weekly_actual", "relative_bias",
                            "share_of_total_demand"]].rename_axis("Item_ID"), floatfmt="{:.3f}"))
    print("\nTop-10 items by volume (how the forecast behaves where it matters most):\n")
    top = by_item.sort_values("sum_actual", ascending=False).head(10)
    print(md_table(top[["Item_Name", "Demand_Archetype", "mean_weekly_actual", "share_of_total_demand", "relative_bias"]].rename_axis("Item_ID"),
                   floatfmt="{:.3f}"))

    # --- bias by archetype / seasonality
    t = test.merge(items[["Item_ID", "Demand_Archetype", "Seasonality_Family", "Seasonality_Profile"]], on="Item_ID", how="left")
    for col in ("Demand_Archetype", "Seasonality_Family"):
        print(f"\n### 1d. Bias by {col} (all horizons pooled)\n")
        grp = t.groupby(col).agg(items=("Item_ID", "nunique"), n=("actual", "size"), mean_actual=("actual", "mean"),
                                 mean_error=("error", "mean"), sum_p50=("p50", "sum"), sum_actual=("actual", "sum"),
                                 share_over=("error", lambda e: (e > 0).mean()), share_under=("error", lambda e: (e < 0).mean()),
                                 P90_coverage=("actual", lambda a: np.nan))
        grp["bias_ratio"] = grp["sum_p50"] / grp["sum_actual"]
        grp["WAPE"] = t.groupby(col).apply(lambda d: wape(d["actual"], d["p50"]), include_groups=False)
        grp["P90_coverage"] = t.groupby(col).apply(lambda d: (d["actual"] <= d["p90"]).mean(), include_groups=False)
        grp["share_of_total_demand"] = grp["sum_actual"] / grp["sum_actual"].sum()
        print(md_table(grp[["items", "n", "mean_actual", "mean_error", "bias_ratio", "share_over", "share_under", "WAPE",
                            "P90_coverage", "share_of_total_demand"]].sort_values("share_of_total_demand", ascending=False)))
    print("\nSeasonality_Family = the word before the colon in Seasonality_Profile (e.g. `dengue:.35` -> dengue); "
          "blank profiles are `none`.")
    print("\n### 1e. Bias by Seasonality_Profile value (all horizons pooled)\n")
    grp = t.groupby("Seasonality_Profile").agg(items=("Item_ID", "nunique"), n=("actual", "size"), mean_actual=("actual", "mean"),
                                               sum_p50=("p50", "sum"), sum_actual=("actual", "sum"))
    grp["bias_ratio"] = grp["sum_p50"] / grp["sum_actual"]
    grp["WAPE"] = t.groupby("Seasonality_Profile").apply(lambda d: wape(d["actual"], d["p50"]), include_groups=False)
    grp.index = grp.index.where(grp.index != "", "(blank)")
    print(md_table(grp[["items", "n", "mean_actual", "bias_ratio", "WAPE"]].sort_values("items", ascending=False)))

    # --- bias by calendar month of the target week (is there a seasonal pattern in the error?)
    print("\n### 1f. Bias by month of the target week (horizon 1)\n")
    h1 = test[test["horizon"] == 1]
    m = h1.groupby(h1["target_week"].dt.month).agg(n=("actual", "size"), mean_actual=("actual", "mean"), mean_error=("error", "mean"),
                                                   sum_p50=("p50", "sum"), sum_actual=("actual", "sum"))
    m["bias_ratio"] = m["sum_p50"] / m["sum_actual"]
    m["P90_coverage"] = h1.groupby(h1["target_week"].dt.month).apply(lambda d: (d["actual"] <= d["p90"]).mean(), include_groups=False)
    m.index.name = "month"
    print(md_table(m[["n", "mean_actual", "mean_error", "bias_ratio", "P90_coverage"]]))


# ----------------------------------------------------------------------------------------------------------------------
# 2. stockout
# ----------------------------------------------------------------------------------------------------------------------
def classification_row(name: str, y: np.ndarray, flag: np.ndarray) -> dict:
    flag = np.asarray(flag, dtype=bool)
    tp = int((flag & (y == 1)).sum())
    fp = int((flag & (y == 0)).sum())
    fn = int((~flag & (y == 1)).sum())
    tn = int((~flag & (y == 0)).sum())
    precision = tp / (tp + fp) if tp + fp else np.nan
    recall = tp / (tp + fn) if tp + fn else np.nan
    f1 = 2 * precision * recall / (precision + recall) if (tp + fp) and (tp + fn) and (precision + recall) else np.nan
    return {"method": name, "flag_rate": flag.mean(), "precision": precision, "recall": recall, "F1": f1,
            "TN": tn, "FP": fp, "FN": fn, "TP": tp}


def _finite(score: np.ndarray) -> np.ndarray:
    """NaN scores (undefined cover) are ranked lowest: replaced by a value below every finite score."""
    s = np.asarray(score, dtype=float)
    if np.isnan(s).any():
        s = np.where(np.isnan(s), np.nanmin(s) - 1.0, s)
    return s


def ranking_row(name: str, y: np.ndarray, score: np.ndarray) -> dict:
    """Ranking quality of a continuous score (higher = riskier)."""
    s = _finite(score)
    return {"method": name, "PR_AUC": average_precision_score(y, s), "ROC_AUC": roc_auc_score(y, s)}


def precision_at_recall(y: np.ndarray, score: np.ndarray, target_recall: float) -> dict:
    """Lowest flag rate (highest score threshold) on these rows that reaches at least target_recall."""
    s = _finite(score)
    order = np.argsort(-s, kind="mergesort")
    ys = y[order]
    tp = np.cumsum(ys)
    recall = tp / ys.sum()
    k = int(np.searchsorted(recall, target_recall, side="left"))
    k = min(k, len(ys) - 1)
    # include ties at the cut-off score
    thr = s[order][k]
    flag = s >= thr
    row = classification_row("", y, flag)
    row["threshold"] = thr
    return row


def stockout_section(artifact: dict, snaps: pd.DataFrame, metrics: dict) -> tuple[pd.DataFrame, np.ndarray]:
    section("2. Stockout risk: calibrated model vs rules vs logistic regression (2025 Monday snapshots)")
    labelled = snaps[snaps["label"].notna()].copy()
    max_date = snaps["date"].max()
    full_window = labelled["date"] + pd.Timedelta(days=artifact["n_days"]) <= max_date   # label window fully observed
    test = labelled[(labelled["date"] >= TEST_START) & full_window].copy()
    train = labelled[labelled["date"] <= VAL_END].copy()
    y = test["label"].to_numpy().astype(int)
    print(f"Test snapshots: {len(test):,} rows, {test['date'].nunique()} Mondays ({test['date'].min().date()} .. "
          f"{test['date'].max().date()}), {test[['store_id', 'item_id']].drop_duplicates().shape[0]:,} store-item pairs, "
          f"positives {y.sum():,} ({y.mean():.2%}). Only snapshots whose 14-day label window is fully observed are kept.\n"
          f"Logistic-regression training rows (snapshots dated <= {VAL_END.date()}): {len(train):,}, "
          f"positive rate {train['label'].mean():.2%}.\n")
    expected_n = sum(metrics["stockout"]["test_2025"]["review_threshold"]["confusion_TN_FP_FN_TP"])
    expected_pos = sum(metrics["stockout"]["test_2025"]["review_threshold"]["confusion_TN_FP_FN_TP"][2:])
    print(f"metrics.json test set: {expected_n:,} rows, {expected_pos:,} positives "
          f"({'match' if (expected_n, expected_pos) == (len(test), int(y.sum())) else 'DIFFERENT'}).\n")

    p_cal = stockout_probability(artifact, test)
    p_raw = artifact["model"].predict_proba(test[artifact["feature_columns"]])[:, 1]
    thr_review, thr_urgent = float(artifact["threshold_review"]), float(artifact["threshold_urgent"])

    # --- model
    print("### 2a. Calibrated model\n")
    overall = pd.DataFrame([
        {"metric": "PR_AUC", "this run": average_precision_score(y, p_cal), "metrics.json": metrics["stockout"]["test_2025"]["review_threshold"]["PR_AUC"]},
        {"metric": "ROC_AUC", "this run": roc_auc_score(y, p_cal), "metrics.json": metrics["stockout"]["test_2025"]["review_threshold"]["ROC_AUC"]},
        {"metric": "Brier (calibrated)", "this run": brier_score_loss(y, p_cal), "metrics.json": metrics["stockout"]["test_2025"]["review_threshold"]["Brier"]},
        {"metric": "Brier (raw, uncalibrated)", "this run": brier_score_loss(y, p_raw), "metrics.json": metrics["stockout"]["test_2025"]["baseline_raw_thr0.5"]["Brier"]},
        {"metric": "Brier of constant base rate", "this run": brier_score_loss(y, np.full(len(y), y.mean())), "metrics.json": np.nan},
        {"metric": "mean predicted probability", "this run": p_cal.mean(), "metrics.json": np.nan},
        {"metric": "observed stockout rate", "this run": y.mean(), "metrics.json": np.nan},
    ]).set_index("metric")
    print(md_table(overall))
    print()
    model_rows = [classification_row(f"model, review threshold {thr_review}", y, p_cal >= thr_review),
                  classification_row(f"model, urgent threshold {thr_urgent}", y, p_cal >= thr_urgent)]
    for r, key in zip(model_rows, ("review_threshold", "urgent_threshold")):
        ref = metrics["stockout"]["test_2025"][key]
        r["metrics.json precision"] = ref["precision"]
        r["metrics.json recall"] = ref["recall"]
    print(md_table(pd.DataFrame(model_rows).set_index("method")))
    recall_review, recall_urgent = model_rows[0]["recall"], model_rows[1]["recall"]

    # --- rules
    print("\n### 2b. Simple rules (binary)\n")
    rules = {
        "rule a: days_of_cover < 14": test["days_of_cover"] < 14,
        "rule b: cover_incl_transit < 14": test["cover_incl_transit"] < 14,
        "rule c: cover_vs_forecast < 1": test["cover_vs_forecast"] < 1,
        "rule a+c: days_of_cover < 14 OR cover_vs_forecast < 1": (test["days_of_cover"] < 14) | (test["cover_vs_forecast"] < 1),
        "rule: already out of stock (stock_on_hand == 0)": test["stock_on_hand"] <= 0,
    }
    rule_rows = [classification_row(n, y, f.fillna(False).to_numpy()) for n, f in rules.items()]
    print(md_table(pd.DataFrame(model_rows[:2] + rule_rows).set_index("method")[["flag_rate", "precision", "recall", "F1", "TP", "FP", "FN"]]))
    print(f"\ncover_vs_forecast is undefined (forecast P50 = 0) on {test['cover_vs_forecast'].isna().mean():.2%} of test rows; "
          "those rows are not flagged by rule c.")

    print("\n### 2c. The same cover features used as a ranking score (lower cover = riskier), matched to the model's recall\n")
    scores = {
        "model (calibrated probability)": p_cal,
        "-days_of_cover": -test["days_of_cover"].to_numpy(dtype=float),
        "-cover_incl_transit": -test["cover_incl_transit"].to_numpy(dtype=float),
        "-cover_vs_forecast": -test["cover_vs_forecast"].to_numpy(dtype=float),
    }
    rows = []
    for name, s in scores.items():
        r = ranking_row(name, y, s)
        for label, target in (("review", recall_review), ("urgent", recall_urgent)):
            m = precision_at_recall(y, s, target)
            r[f"precision @ recall {target:.3f} ({label})"] = m["precision"]
            r[f"flag rate @ recall {target:.3f} ({label})"] = m["flag_rate"]
            r[f"cut-off ({label})"] = -m["threshold"] if name != "model (calibrated probability)" else m["threshold"]
        rows.append(r)
    print(md_table(pd.DataFrame(rows).set_index("method")))
    print("\nFor the cover features the cut-off column is the cover value (days, or ratio) below which a row would be flagged to reach that recall.")

    # --- logistic regression
    print("\n### 2d. Logistic regression on the same 17 features (fit on snapshots <= 2024-12-31, no 2025 data)\n")
    feats = list(artifact["feature_columns"])
    X_tr, y_tr = train[feats].to_numpy(dtype=float), train["label"].to_numpy().astype(int)
    X_te = test[feats].to_numpy(dtype=float)
    variants = {
        "logistic (median impute + standardise)": Pipeline([
            ("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler()),
            ("lr", LogisticRegression(max_iter=2000, C=1.0))]),
        "logistic (log1p + median impute + standardise)": Pipeline([
            ("log", FunctionTransformer(np.log1p)), ("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler()),
            ("lr", LogisticRegression(max_iter=2000, C=1.0))]),
    }
    rows, lr_probs = [], {}
    for name, pipe in variants.items():
        t0 = time.perf_counter()
        pipe.fit(X_tr, y_tr)
        p = pipe.predict_proba(X_te)[:, 1]
        lr_probs[name] = p
        r = ranking_row(name, y, p)
        r["Brier"] = brier_score_loss(y, p)
        for label, target in (("review", recall_review), ("urgent", recall_urgent)):
            m = precision_at_recall(y, p, target)
            r[f"precision @ recall {target:.3f} ({label})"] = m["precision"]
            r[f"flag rate @ recall {target:.3f} ({label})"] = m["flag_rate"]
            r[f"threshold ({label})"] = m["threshold"]
        r["fit_s"] = time.perf_counter() - t0
        rows.append(r)
    r = ranking_row("HistGradientBoosting model (calibrated)", y, p_cal)
    r["Brier"] = brier_score_loss(y, p_cal)
    for label, target, thr in (("review", recall_review, thr_review), ("urgent", recall_urgent, thr_urgent)):
        m = classification_row("", y, p_cal >= thr)
        r[f"precision @ recall {target:.3f} ({label})"] = m["precision"]
        r[f"flag rate @ recall {target:.3f} ({label})"] = m["flag_rate"]
        r[f"threshold ({label})"] = thr
    rows.append(r)
    print(md_table(pd.DataFrame(rows).set_index("method")))
    print("\nLogistic thresholds are chosen on the 2025 test rows to match the model's recall exactly, which flatters the logistic "
          "model slightly (the model's thresholds were fixed on 2024 validation data).")
    best_lr = max(lr_probs, key=lambda k: average_precision_score(y, lr_probs[k]))
    print(f"\nF1 of the better logistic variant ({best_lr}) at the review-matched recall: "
          f"{precision_at_recall(y, lr_probs[best_lr], recall_review)['F1']:.3f}; at the urgent-matched recall: "
          f"{precision_at_recall(y, lr_probs[best_lr], recall_urgent)['F1']:.3f}.")

    # --- where do the model's misses sit?
    print("\n### 2e. Model probability on the 2025 stockouts that actually happened\n")
    pos = pd.Series(p_cal[y == 1])
    q = pos.quantile([0.1, 0.25, 0.5, 0.75, 0.9]).rename(lambda x: f"p{int(x*100)}")
    print(md_table(pd.DataFrame({"calibrated probability among actual stockouts": q}).rename_axis("quantile")))
    print(f"\nShare of actual stockouts with probability below the review threshold (missed entirely): {(pos < thr_review).mean():.1%}; "
          f"below 1%: {(pos < 0.01).mean():.1%}.")
    return test, p_cal


# ----------------------------------------------------------------------------------------------------------------------
# 3. calibration
# ----------------------------------------------------------------------------------------------------------------------
def calibration_section(test: pd.DataFrame, p_cal: np.ndarray) -> None:
    section("3. Calibration reliability table (calibrated model, 2025)")
    y = test["label"].to_numpy().astype(int)
    bins = pd.cut(p_cal, CALIBRATION_BINS, right=False, labels=CALIBRATION_LABELS, include_lowest=True)
    tab = pd.DataFrame({"bin": bins, "p": p_cal, "y": y}).groupby("bin", observed=False).agg(
        count=("y", "size"), mean_predicted=("p", "mean"), observed_rate=("y", "mean"), stockouts=("y", "sum"))
    tab["share_of_rows"] = tab["count"] / tab["count"].sum()
    tab["share_of_all_stockouts"] = tab["stockouts"] / tab["stockouts"].sum()
    tab["gap (observed - predicted)"] = tab["observed_rate"] - tab["mean_predicted"]
    # 95% binomial half-width, to see whether the gap is beyond sampling noise
    tab["observed_rate 95% half-width"] = 1.96 * np.sqrt(tab["observed_rate"] * (1 - tab["observed_rate"]) / tab["count"].clip(lower=1))
    print(md_table(tab.rename_axis("predicted probability bin")))
    nonempty = tab[tab["count"] > 0]
    ece = float((nonempty["share_of_rows"] * nonempty["gap (observed - predicted)"].abs()).sum())
    print(f"\nExpected calibration error (row-weighted mean |gap| over these bins): {ece:.4f}. "
          f"Largest |gap| in a bin with >= 100 rows: "
          f"{nonempty[nonempty['count'] >= 100]['gap (observed - predicted)'].abs().max():.3f}.")

    print("\n### 3b. Finer view of the low range, where most rows sit (decile-style bins of predicted probability)\n")
    fine_edges = [0, 0.01, 0.02, 0.0416, 0.07, 0.10, 0.15, 0.2126, 0.30, 0.40, 0.50, 0.65, 0.80, 1.0000001]
    fb = pd.cut(p_cal, fine_edges, right=False, include_lowest=True)
    ft = pd.DataFrame({"bin": fb, "p": p_cal, "y": y}).groupby("bin", observed=False).agg(
        count=("y", "size"), mean_predicted=("p", "mean"), observed_rate=("y", "mean"))
    ft["gap"] = ft["observed_rate"] - ft["mean_predicted"]
    ft.index = ft.index.astype(str)
    print(md_table(ft.rename_axis("predicted probability bin")))

    print("\n### 3c. Calibration by store (does one store drag the table?)\n")
    bs = pd.DataFrame({"store": test["store_id"].to_numpy(), "p": p_cal, "y": y}).groupby("store").agg(
        count=("y", "size"), mean_predicted=("p", "mean"), observed_rate=("y", "mean"))
    bs["gap"] = bs["observed_rate"] - bs["mean_predicted"]
    print(md_table(bs))


# ----------------------------------------------------------------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--cache", type=Path, default=None, help="directory for pickled intermediates (optional, speeds up re-runs)")
    parser.add_argument("--skip-demand", action="store_true")
    parser.add_argument("--skip-stockout", action="store_true")
    args = parser.parse_args()

    artifacts = load_artifacts()
    metrics = json.loads((TRAINED_DIR / "metrics.json").read_text())
    print(f"# Model evaluation run\n\nDemand model {artifacts.demand_model_name} v{artifacts.demand_model_version}; stockout model "
          f"{artifacts.stockout_model_name} v{artifacts.stockout_model_version} (n_days {artifacts.stockout_horizon_days}, thresholds "
          f"review {artifacts.threshold_review} / urgent {artifacts.threshold_urgent}); features.py hash {artifacts.feature_version}; "
          f"metrics.json trained_on {metrics['trained_on']}.")
    items = read_items()

    log("reading demand.csv")
    demand = read_demand()
    log(f"demand rows {len(demand):,} ({demand['Demand_Date'].min().date()} .. {demand['Demand_Date'].max().date()}); capping per item at 99.9th pct")
    weekly = build_weekly_demand(cap_demand_outliers(demand))
    del demand
    log(f"weekly grid {len(weekly):,} rows, weeks {weekly['week_start'].min().date()} .. {weekly['week_start'].max().date()}")

    ev = cached(args.cache, "demand_eval", lambda: demand_eval_frame(artifacts.demand, weekly))
    log(f"forecast rows with actuals {len(ev):,}")
    if not args.skip_demand:
        demand_section(artifacts.demand, ev, items, metrics)

    if not args.skip_stockout:
        def build_snaps():
            log("reading daily_inventory.csv, transfers, purchase orders")
            raw = read_stockout_inputs()
            log(f"inventory rows {len(raw['inventory']):,}; forecasting from every week for the stockout features")
            fc_all = forecast(artifacts.demand, weekly, all_weeks=True)
            log("building Monday snapshots with labels (several minutes)")
            return build_stockout_snapshots(raw["inventory"], raw["transfers"], raw["purchase_orders"], raw["supplier_items"],
                                            n_days=artifacts.stockout_horizon_days, forecasts=fc_all, with_label=True)
        snaps = cached(args.cache, "stockout_snapshots", build_snaps)
        log(f"snapshots {len(snaps):,} rows, {snaps['date'].min().date()} .. {snaps['date'].max().date()}")
        test, p_cal = stockout_section(artifacts.stockout, snaps, metrics)
        calibration_section(test, p_cal)
    log("done")


if __name__ == "__main__":
    main()
