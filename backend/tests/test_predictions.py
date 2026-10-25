# Phase 6: trained artifacts load and the runtime prediction flow works on a small synthetic history (no database).

import datetime
import json
import numpy as np
import pandas as pd
import pytest
from app.ml.artifacts import TRAINED_DIR, get_artifacts
from app.ml.features import DEMAND_FEATURES, STOCKOUT_FEATURES
from app.services.feature_inputs import prediction_date_for
from app.services.predictions import PredictionError, cap_demand_outliers, risk_level, run_predictions

PREDICTION_DATE = datetime.date(2025, 6, 2)   # a Monday
ITEM = "MED-000001"


@pytest.fixture(scope="module")
def artifacts():
    return get_artifacts()


def history(end: datetime.date = PREDICTION_DATE, days: int = 140) -> dict:
    """One item in the central store and one sub-store, daily rows up to `end`."""
    dates = pd.date_range(end=pd.Timestamp(end), periods=days, freq="D")
    demand = pd.DataFrame({"Demand_Date": np.tile(dates, 2), "Store_ID": ["STR-001"] * days + ["STR-002"] * days,
                           "Item_ID": ITEM, "Demand_Quantity": np.tile(5 + dates.dayofyear % 10, 2)})
    inventory = pd.DataFrame({"date": np.tile(dates, 2), "store_id": ["STR-001"] * days + ["STR-002"] * days,
                              "item_id": ITEM, "demand_qty": demand["Demand_Quantity"].values,
                              "closing_qty": [500] * days + [40] * days, "on_order_qty": 0, "is_stockout": 0})
    transfers = pd.DataFrame({"transfer_date": pd.to_datetime([]), "to_store_id": [], "item_id": [], "shipped_qty": []})
    purchase_orders = pd.DataFrame({
        "purchase_order_id": ["PO-1"], "supplier_id": ["SUP-001"], "item_id": [ITEM],
        "order_date": [dates[10]], "expected_delivery_date": [dates[20]], "receipt_date": [dates[22]],
        "lead_time_days": [12], "ordered_quantity": [300], "is_emergency": [0]})
    supplier_items = pd.DataFrame({"Item_ID": [ITEM], "Supplier_ID": ["SUP-001"], "Preferred_Supplier_Flag": ["Y"]})
    return {"prediction_date": PREDICTION_DATE, "demand": demand, "inventory": inventory, "transfers": transfers,
            "purchase_orders": purchase_orders, "supplier_items": supplier_items}


def test_artifacts_metadata_matches_training_output(artifacts):
    metrics = json.loads((TRAINED_DIR / "metrics.json").read_text())
    assert artifacts.demand["feature_columns"] == DEMAND_FEATURES
    assert artifacts.stockout["feature_columns"] == STOCKOUT_FEATURES
    assert artifacts.horizons == [1, 2, 3, 4]
    assert artifacts.stockout_horizon_days == metrics["stockout"]["n_days"] == 14
    assert artifacts.threshold_review == metrics["stockout"]["threshold_review"]
    assert artifacts.threshold_urgent == metrics["stockout"]["threshold_urgent"]
    assert artifacts.demand_model_name == "XGBoost" and artifacts.stockout_model_name == "HistGradientBoosting"
    assert artifacts.demand_model_version == artifacts.stockout_model_version == metrics["version"]


def test_artifacts_are_loaded_once():
    assert get_artifacts() is get_artifacts()


def test_risk_level_uses_saved_thresholds():
    levels = risk_level(np.array([0.0, 0.0415, 0.0416, 0.2125, 0.2126, 0.9]), 0.0416, 0.2126)
    assert levels.tolist() == ["LOW", "LOW", "REVIEW", "REVIEW", "URGENT", "URGENT"]


def test_run_predictions_returns_forecasts_and_stockout(artifacts):
    run = run_predictions(history(), PREDICTION_DATE, artifacts)
    assert run.prediction_date == PREDICTION_DATE
    assert run.forecast_week_start == PREDICTION_DATE - datetime.timedelta(days=7)

    fc = run.forecasts
    assert len(fc) == 2 * 4                              # 2 stores x 4 horizons
    assert fc.loc[fc["horizon"] == 1, "target_week"].unique().tolist() == [PREDICTION_DATE]
    assert (fc["p50"] >= 0).all() and (fc["p90"] >= fc["p50"]).all()

    so = run.stockout
    assert so[["store_id", "item_id"]].values.tolist() == [["STR-002", ITEM]]   # sub-stores only
    assert so["probability"].between(0, 1).all()
    assert so["risk_level"].iloc[0] in {"LOW", "REVIEW", "URGENT"}


def test_rows_after_prediction_date_do_not_change_results(artifacts):
    """Features at the prediction date only use earlier rows (the SQL queries cut at the prediction date anyway)."""
    base = run_predictions(history(), PREDICTION_DATE, artifacts)
    longer = history(end=PREDICTION_DATE + datetime.timedelta(days=3), days=143)
    as_of = pd.Timestamp(PREDICTION_DATE)
    cut = {**longer, "demand": longer["demand"][longer["demand"]["Demand_Date"] <= as_of],
           "inventory": longer["inventory"][longer["inventory"]["date"] <= as_of]}
    again = run_predictions(cut, PREDICTION_DATE, artifacts)
    pd.testing.assert_frame_equal(base.forecasts, again.forecasts)
    pd.testing.assert_frame_equal(base.stockout, again.stockout)


def test_incomplete_last_week_is_rejected(artifacts):
    inputs = history(end=PREDICTION_DATE - datetime.timedelta(days=2))   # demand stops on Saturday
    with pytest.raises(PredictionError, match="complete week"):
        run_predictions(inputs, PREDICTION_DATE, artifacts)


def test_demand_cap_limits_each_item_to_its_own_percentile():
    quantities = [10] * 999 + [5000]
    demand = pd.DataFrame({"Demand_Date": pd.Timestamp("2025-01-01"), "Store_ID": "STR-002",
                           "Item_ID": ["A"] * 1000 + ["B"], "Demand_Quantity": quantities + [7]})
    capped = cap_demand_outliers(demand)
    a = capped.loc[capped["Item_ID"] == "A", "Demand_Quantity"]
    assert a.max() == pytest.approx(pd.Series(quantities).quantile(0.999)) and a.max() < 5000
    assert (a.iloc[:999] == 10).all()
    assert capped.loc[capped["Item_ID"] == "B", "Demand_Quantity"].tolist() == [7]


def test_prediction_date_is_the_cutoff_sunday_or_the_latest_monday():
    assert prediction_date_for(datetime.date(2025, 11, 30)) == datetime.date(2025, 11, 30)   # Sunday -> itself
    assert prediction_date_for(datetime.date(2025, 12, 29)) == datetime.date(2025, 12, 29)   # Monday -> itself
    assert prediction_date_for(datetime.date(2025, 12, 31)) == datetime.date(2025, 12, 29)   # Wednesday -> Monday
    assert prediction_date_for(datetime.date(2025, 12, 6)) == datetime.date(2025, 12, 1)     # Saturday -> Monday


def test_sunday_cutoff_forecasts_the_four_weeks_after_it(artifacts):
    sunday = PREDICTION_DATE + datetime.timedelta(days=6)
    run = run_predictions({**history(end=sunday, days=146), "prediction_date": sunday}, sunday, artifacts)
    assert run.prediction_date == sunday
    assert run.forecast_week_start == PREDICTION_DATE                     # the week ending on the cutoff Sunday
    targets = run.forecasts.drop_duplicates("horizon").set_index("horizon")["target_week"].to_dict()
    assert targets == {h: sunday + datetime.timedelta(days=1 + 7 * (h - 1)) for h in (1, 2, 3, 4)}
    assert run.stockout["probability"].between(0, 1).all() and len(run.stockout) == 1
