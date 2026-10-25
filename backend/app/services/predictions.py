import datetime
from dataclasses import dataclass

import numpy as np
import pandas as pd
from sqlalchemy.engine import Connection

from app.ml.artifacts import ModelArtifacts, get_artifacts
from app.ml.features import build_stockout_snapshots, build_weekly_demand, forecast, stockout_probability
from app.services.feature_inputs import load_feature_inputs

RISK_URGENT = "URGENT"   # probability >= threshold_urgent
RISK_REVIEW = "REVIEW"   # threshold_review <= probability < threshold_urgent
RISK_LOW = "LOW"

DATE_COLUMNS = {
    "demand": ["Demand_Date"],
    "inventory": ["date"],
    "transfers": ["transfer_date"],
    "purchase_orders": ["order_date", "expected_delivery_date", "receipt_date"],
}

DEMAND_CAP_QUANTILE = 0.999   # notebook clean_demand: per-item cap the demand model was trained with


class PredictionError(Exception):
    pass


@dataclass
class PredictionRun:
    data_cutoff_date: datetime.date
    prediction_date: datetime.date        # stockout snapshot date: the cutoff if Sunday, else latest Monday <= cutoff
    forecast_week_start: datetime.date    # last complete demand week (Mon..Sun) on or before the prediction date
    artifacts: ModelArtifacts
    forecasts: pd.DataFrame               # store_id, item_id, horizon, target_week, p50, p90
    stockout: pd.DataFrame                # store_id, item_id, probability, risk_level


def risk_level(probability: np.ndarray, threshold_review: float, threshold_urgent: float) -> np.ndarray:
    return np.select([probability >= threshold_urgent, probability >= threshold_review],
                     [RISK_URGENT, RISK_REVIEW], default=RISK_LOW)


def _dates_as_ns(inputs: dict) -> dict:
    """features.py was trained under pandas 2, where every datetime is datetime64[ns]. pandas 3 picks the resolution
    from the input (seconds for DB dates), and features.py's merge_asof rejects mixed resolutions, so convert first."""
    out = dict(inputs)
    for name, cols in DATE_COLUMNS.items():
        out[name] = inputs[name].assign(**{c: pd.to_datetime(inputs[name][c]).astype("datetime64[ns]") for c in cols})
    return out


def cap_demand_outliers(demand: pd.DataFrame) -> pd.DataFrame:
    """Training preprocessing from the notebook's clean_demand (not part of features.py): cap each item's
    Demand_Quantity at that item's 99.9th percentile. The notebook took the percentile over the whole dataset; here it
    is taken only over the rows passed in, which are all dated on or before the prediction date (no future data)."""
    cap = demand.groupby("Item_ID")["Demand_Quantity"].transform(lambda x: x.quantile(DEMAND_CAP_QUANTILE))
    return demand.assign(Demand_Quantity=np.minimum(demand["Demand_Quantity"], cap))


def run_predictions(inputs: dict, data_cutoff_date: datetime.date, artifacts: ModelArtifacts) -> PredictionRun:
    """inputs = load_feature_inputs(...) output (every row is dated on or before inputs['prediction_date'])."""
    inputs = _dates_as_ns(inputs)
    as_of = pd.Timestamp(inputs["prediction_date"])
    if as_of.dayofweek not in (0, 6):
        raise PredictionError(f"prediction date {as_of.date()} is not a Monday or a Sunday")

    # 1-3. capped weekly demand -> P50/P90 forecast from the last complete week ending on or before the prediction
    # date (the week ending that Sunday, or the week before a Monday). H1 is always the week after it.
    weekly = build_weekly_demand(cap_demand_outliers(inputs["demand"]))
    last_sunday = as_of - pd.Timedelta(days=(as_of.dayofweek + 1) % 7)
    forecast_week = last_sunday - pd.Timedelta(days=6)
    if weekly.empty or weekly["week_start"].max() != forecast_week:
        latest = None if weekly.empty else weekly["week_start"].max().date()
        raise PredictionError(f"demand history must include the complete week starting {forecast_week.date()} "
                              f"(latest complete week in DB: {latest})")
    fc = forecast(artifacts.demand, weekly, as_of=forecast_week)

    # 4. the same forecast feeds the stockout features (fc_next_n_p50/p90 for the snapshot on the prediction date).
    # The model was trained on Monday snapshots; a Sunday snapshot (end of the uploaded week) scores almost the same
    # on the 2025 test data (PR-AUC 0.471 vs 0.480, recall at the review threshold 0.76 vs 0.77).
    snapshots = build_stockout_snapshots(inputs["inventory"], inputs["transfers"], inputs["purchase_orders"],
                                         inputs["supplier_items"], n_days=artifacts.stockout_horizon_days,
                                         forecasts=fc, snapshot_weekday=as_of.dayofweek, with_label=False)
    latest = snapshots[snapshots["date"] == as_of].reset_index(drop=True)
    if latest.empty:
        raise PredictionError(f"no inventory snapshot on the prediction date {as_of.date()}")

    # 5-6. calibrated probability, then the saved review/urgent thresholds
    probability = stockout_probability(artifacts.stockout, latest)
    stockout = latest[["store_id", "item_id"]].copy()
    stockout["probability"] = probability
    stockout["risk_level"] = risk_level(probability, artifacts.threshold_review, artifacts.threshold_urgent)

    forecasts = (fc.rename(columns={"Store_ID": "store_id", "Item_ID": "item_id"})
                   [["store_id", "item_id", "horizon", "target_week", "p50", "p90"]])
    forecasts["target_week"] = forecasts["target_week"].dt.date
    return PredictionRun(
        data_cutoff_date=data_cutoff_date,
        prediction_date=as_of.date(),
        forecast_week_start=forecast_week.date(),
        artifacts=artifacts,
        forecasts=forecasts.sort_values(["store_id", "item_id", "horizon"]).reset_index(drop=True),
        stockout=stockout.sort_values(["store_id", "item_id"]).reset_index(drop=True),
    )


def predict(conn: Connection, data_cutoff_date: datetime.date, artifacts: ModelArtifacts | None = None) -> PredictionRun:
    """Read history up to the prediction date from PostgreSQL and run both models."""
    inputs = load_feature_inputs(conn, data_cutoff_date)
    return run_predictions(inputs, data_cutoff_date, artifacts or get_artifacts())
