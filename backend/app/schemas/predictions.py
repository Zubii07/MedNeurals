import datetime

from pydantic import BaseModel

from app.schemas.recommendations import RecommendationRefreshResult


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


class PredictionRun(BaseModel):
    """One prediction refresh: a demand_forecast run and the stockout run that used its forecast."""
    status: str
    data_cutoff_date: datetime.date
    prediction_date: datetime.date
    completed_at: datetime.datetime | None
    forecast_count: int
    stockout_count: int
    demand_forecast: ModelRunInfo
    stockout: ModelRunInfo


class PredictionStatus(PredictionRun):
    recommendations: RecommendationRefreshResult | None = None   # only on POST /predictions/refresh


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


class ThresholdPerformance(BaseModel):
    """How the saved threshold behaved on the held-out test period (metrics.json)."""
    threshold: float
    precision: float                # share of flagged store x item rows that really ran out
    recall: float                   # share of real stockouts that were flagged
    flag_rate: float                # share of all store x item rows flagged


class StockoutModelDetails(BaseModel):
    model_name: str
    model_version: str
    horizon_days: int
    thresholds: StockoutThresholds
    calibration: str | None         # e.g. "Platt scaling fitted on validation-A"
    test_period: str
    review: ThresholdPerformance
    urgent: ThresholdPerformance
    pr_auc: float | None
    roc_auc: float | None
    brier: float | None


class DemandModelDetails(BaseModel):
    model_name: str
    model_version: str
    horizons: list[int]
    test_period: str
    wape_by_horizon: dict[str, float]               # "1".."4" -> weighted absolute percentage error
    p90_coverage_by_horizon: dict[str, float]       # share of actual weeks at or below P90 (target 0.90)
    seasonal_naive_wape_by_horizon: dict[str, float]


class ModelDetails(BaseModel):
    """Static description of the trained artifacts for the explanation texts and the project-team page."""
    trained_on: str | None
    feature_version: str
    demand: DemandModelDetails
    stockout: StockoutModelDetails


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
