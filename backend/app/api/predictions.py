import datetime
from fastapi import APIRouter, HTTPException, Query
from app.database.connection import engine
from app.schemas.predictions import PredictionPreview, PredictionStatus
from app.services.model_runs import latest_completed_run_id, latest_data_cutoff, refresh_predictions, run_status
from app.services.predictions import PredictionError, predict, RISK_LOW, RISK_REVIEW, RISK_URGENT
from app.services.recommendations import generate_recommendations

router = APIRouter(prefix="/predictions", tags=["predictions"])


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
