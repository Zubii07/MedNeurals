import datetime

from pydantic import BaseModel


class ModelInfo(BaseModel):
    model_type: str
    model_name: str
    model_version: str


class ModelRunInfo(ModelInfo):
    model_run_id: int
    feature_version: str
    status: str                     # running / completed / failed
    prediction_count: int           # prediction rows saved for this run
    started_at: datetime.datetime
    completed_at: datetime.datetime | None


class PredictionStatus(BaseModel):
    """One prediction refresh: a demand_forecast run and the stockout run that used its forecast."""
    status: str
    data_cutoff_date: datetime.date
    prediction_date: datetime.date
    completed_at: datetime.datetime | None
    forecast_count: int
    stockout_count: int
    demand_forecast: ModelRunInfo
    stockout: ModelRunInfo


class StockoutThresholds(BaseModel):
    review: float
    urgent: float


class ForecastPrediction(BaseModel):
    store_id: str
    item_id: str
    horizon: int                    # weeks ahead; horizon 1 = the week after forecast_week_start
    target_week: datetime.date      # Monday of the forecast week
    p50: float
    p90: float


class StockoutPrediction(BaseModel):
    store_id: str
    item_id: str
    probability: float              # calibrated P(stockout within horizon_days)
    risk_level: str                 # URGENT / REVIEW / LOW from the saved thresholds


class PredictionPreview(BaseModel):
    data_cutoff_date: datetime.date
    prediction_date: datetime.date
    forecast_week_start: datetime.date
    models: list[ModelInfo]
    trained_on: str | None
    stockout_horizon_days: int
    thresholds: StockoutThresholds
    forecast_count: int
    stockout_count: int
    risk_level_counts: dict[str, int]
    forecasts: list[ForecastPrediction]
    stockout: list[StockoutPrediction]
