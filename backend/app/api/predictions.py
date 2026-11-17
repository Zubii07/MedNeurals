import datetime
import logging
from fastapi import APIRouter, HTTPException, Query
from app.database.connection import engine
from app.ml.artifacts import get_artifacts, get_metrics
from app.schemas.predictions import ModelDetails, PredictionPreview, PredictionStatus
from app.services.model_runs import latest_completed_run_id, latest_data_cutoff, refresh_predictions, run_status
from app.services.predictions import PredictionError, predict, RISK_LOW, RISK_REVIEW, RISK_URGENT
from app.services.recommendations import generate_recommendations

router = APIRouter(prefix="/predictions", tags=["predictions"])
logger = logging.getLogger(__name__)


@router.post("/refresh", response_model=PredictionStatus)
def refresh() -> PredictionStatus:
    """Run both models on the latest data cutoff and save the results as new model runs (earlier runs are kept), then
    generate the run's recommendations. The predictions are committed first: a failed recommendation step is reported
    in `recommendations` and can be retried with recommendations/refresh."""
    try:
        stockout_run_id = refresh_predictions(engine)
    except PredictionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    try:
        recommendations = {"status": "generated", "summary": generate_recommendations(engine, stockout_run_id)}
    except Exception as exc:    # any failure here is reported; the committed predictions are kept
        logger.exception("recommendation generation failed for stockout run %s", stockout_run_id)
        recommendations = {"status": "failed", "error": str(exc)[:2000]}
    with engine.connect() as conn:
        return PredictionStatus(**run_status(conn, stockout_run_id), recommendations=recommendations)


@router.get("/status", response_model=PredictionStatus)
def status() -> PredictionStatus:
    """The latest successful prediction refresh. Failed or running refreshes are not reported here."""
    with engine.connect() as conn:
        run_id = latest_completed_run_id(conn)
        if run_id is None:
            raise HTTPException(status_code=404, detail="no successful prediction run yet; call POST /predictions/refresh")
        return PredictionStatus(**run_status(conn, run_id))


@router.get("/models", response_model=ModelDetails)
def model_details() -> ModelDetails:
    """What the trained models are and how they scored on their held-out test period (app/ml/trained/metrics.json).
    Used for the plain-language explanation of a stockout probability and for the project-team page."""
    a = get_artifacts()
    metrics = get_metrics()
    if metrics is None:
        raise HTTPException(status_code=404, detail="metrics.json is not available for the trained artifacts")
    so, dm = metrics["stockout"], metrics["demand_forecast"]
    so_test_key = next(k for k in so if k.startswith("test_"))
    dm_test_key = next(k for k in dm if k.startswith("test_"))
    so_test, dm_test = so[so_test_key], dm[dm_test_key]

    def performance(block: dict) -> dict:
        return {k: block[k] for k in ("threshold", "precision", "recall", "flag_rate")}

    return ModelDetails(
        trained_on=a.trained_on,
        feature_version=a.feature_version,
        demand={
            "model_name": a.demand_model_name, "model_version": a.demand_model_version, "horizons": a.horizons,
            "test_period": dm_test_key.removeprefix("test_"),
            "wape_by_horizon": {h[1:]: v["WAPE"] for h, v in dm_test.items()},
            "p90_coverage_by_horizon": {h[1:]: v["P90_coverage"] for h, v in dm_test.items()},
            "seasonal_naive_wape_by_horizon": {h[1:]: v["seasonal_naive_WAPE"] for h, v in dm_test.items()},
        },
        stockout={
            "model_name": a.stockout_model_name, "model_version": a.stockout_model_version,
            "horizon_days": a.stockout_horizon_days,
            "thresholds": {"review": a.threshold_review, "urgent": a.threshold_urgent},
            "calibration": so.get("calibration"), "test_period": so_test_key.removeprefix("test_"),
            "review": performance(so_test["review_threshold"]), "urgent": performance(so_test["urgent_threshold"]),
            "pr_auc": so_test["review_threshold"].get("PR_AUC"), "roc_auc": so_test["review_threshold"].get("ROC_AUC"),
            "brier": so_test["review_threshold"].get("Brier"),
        },
    )


@router.get("/preview", response_model=PredictionPreview)
def preview_predictions(
    data_cutoff: datetime.date | None = Query(None, description="Default: latest daily_inventory date in the DB"),
    item_id: str | None = Query(None, description="Only return rows for this item (all items are still predicted)"),
    store_id: str | None = None,
) -> PredictionPreview:
    """Run both models on the DB data up to the cutoff and return the results."""
    with engine.connect() as conn:
        if data_cutoff is None:
            data_cutoff = latest_data_cutoff(conn)
            if data_cutoff is None:
                raise HTTPException(status_code=400, detail="no inventory data in the database")
        try:
            run = predict(conn, data_cutoff)
        except PredictionError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    forecasts, stockout = run.forecasts, run.stockout
    if item_id:
        forecasts, stockout = forecasts[forecasts["item_id"] == item_id], stockout[stockout["item_id"] == item_id]
    if store_id:
        forecasts, stockout = forecasts[forecasts["store_id"] == store_id], stockout[stockout["store_id"] == store_id]
    a = run.artifacts
    counts = run.stockout["risk_level"].value_counts()
    return PredictionPreview(
        data_cutoff_date=run.data_cutoff_date,
        prediction_date=run.prediction_date,
        forecast_week_start=run.forecast_week_start,
        models=[
            {"model_type": "demand_forecast", "model_name": a.demand_model_name, "model_version": a.demand_model_version},
            {"model_type": "stockout", "model_name": a.stockout_model_name, "model_version": a.stockout_model_version},
        ],
        trained_on=a.trained_on,
        stockout_horizon_days=a.stockout_horizon_days,
        thresholds={"review": a.threshold_review, "urgent": a.threshold_urgent},
        forecast_count=len(run.forecasts),
        stockout_count=len(run.stockout),
        risk_level_counts={level: int(counts.get(level, 0)) for level in (RISK_URGENT, RISK_REVIEW, RISK_LOW)},
        forecasts=forecasts.to_dict("records"),
        stockout=stockout.to_dict("records"),
    )
