import datetime
from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import text
from app.database.connection import engine
from app.schemas.predictions import PredictionPreview
from app.services.predictions import PredictionError, predict, RISK_LOW, RISK_REVIEW, RISK_URGENT

router = APIRouter(prefix="/predictions", tags=["predictions"])


@router.get("/preview", response_model=PredictionPreview)
def preview_predictions(
    data_cutoff: datetime.date | None = Query(None, description="Default: latest daily_inventory date in the DB"),
    item_id: str | None = Query(None, description="Only return rows for this item (all items are still predicted)"),
    store_id: str | None = None,
) -> PredictionPreview:
    """Run both models on the DB data up to the cutoff and return the results."""
    with engine.connect() as conn:
        if data_cutoff is None:
            data_cutoff = conn.execute(text("SELECT max(date) FROM daily_inventory")).scalar()
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
