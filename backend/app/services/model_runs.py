# Prediction refresh: run both models on the latest data cutoff and save the results as new model runs.

import datetime
import io

import pandas as pd
from sqlalchemy import func, insert, select, text, update
from sqlalchemy.engine import Connection, Engine

from app.ml.artifacts import ModelArtifacts, get_artifacts
from app.models.predictions import (
    ForecastPrediction,
    MODEL_TYPE_DEMAND,
    MODEL_TYPE_STOCKOUT,
    ModelRun,
    RUN_COMPLETED,
    RUN_FAILED,
    RUN_RUNNING,
    StockoutPrediction,
)
from app.services.feature_inputs import prediction_date_for
from app.services.predictions import PredictionError, PredictionRun, predict

runs = ModelRun.__table__

FORECAST_COLUMNS = ["model_run_id", "store_id", "item_id", "prediction_date", "horizon", "target_week", "p50", "p90"]
STOCKOUT_COLUMNS = ["model_run_id", "store_id", "item_id", "prediction_date", "horizon_days", "probability",
                    "risk_level", "threshold_review", "threshold_urgent"]


def latest_data_cutoff(conn: Connection) -> datetime.date | None:
    """The data cutoff of a refresh: the latest daily_inventory date in the DB (same default as /predictions/preview)."""
    return conn.execute(text("SELECT max(date) FROM daily_inventory")).scalar()


def _copy_rows(conn: Connection, table: str, df: pd.DataFrame, columns: list[str]) -> None:
    """COPY a DataFrame into a table inside the caller's transaction. Floats are widened to float64 first: the models
    return float32, whose short text form would not read back as the same double."""
    buffer = io.StringIO()
    df = df[columns].astype({c: "float64" for c in columns if df[c].dtype.kind == "f"})
    df.to_csv(buffer, header=False, index=False, date_format="%Y-%m-%d")
    cursor = conn.connection.driver_connection.cursor()
    with cursor.copy(f"COPY {table} ({', '.join(columns)}) FROM STDIN (FORMAT csv)") as copy:
        copy.write(buffer.getvalue())


def _save_predictions(conn: Connection, run: PredictionRun, demand_run_id: int, stockout_run_id: int) -> None:
    a = run.artifacts
    forecasts = run.forecasts.assign(model_run_id=demand_run_id, prediction_date=run.prediction_date)
    stockout = run.stockout.assign(model_run_id=stockout_run_id, prediction_date=run.prediction_date,
                                   horizon_days=a.stockout_horizon_days, threshold_review=a.threshold_review,
                                   threshold_urgent=a.threshold_urgent)
    _copy_rows(conn, ForecastPrediction.__tablename__, forecasts, FORECAST_COLUMNS)
    _copy_rows(conn, StockoutPrediction.__tablename__, stockout, STOCKOUT_COLUMNS)
    for run_id, count in ((demand_run_id, len(forecasts)), (stockout_run_id, len(stockout))):
        conn.execute(update(runs).where(runs.c.id == run_id).values(
            status=RUN_COMPLETED, prediction_count=count, completed_at=func.now()))


def refresh_predictions(engine: Engine, artifacts: ModelArtifacts | None = None) -> int:
    """Run both models on the latest data cutoff and save the results. Returns the stockout model_run id (it links to
    the demand_forecast run of the same refresh). Raises PredictionError if the data cannot be predicted on; the runs
    are then recorded as failed."""
    artifacts = artifacts or get_artifacts()
    # One REPEATABLE READ snapshot for the cutoff and all feature queries, so an import running at the same time
    # cannot change the data between them.
    with engine.connect().execution_options(isolation_level="REPEATABLE READ") as read_conn:
        data_cutoff = latest_data_cutoff(read_conn)
        if data_cutoff is None:
            raise PredictionError("no inventory data in the database")

        common = {"feature_version": artifacts.feature_version, "data_cutoff_date": data_cutoff,
                  "prediction_date": prediction_date_for(data_cutoff), "status": RUN_RUNNING}
        with engine.begin() as conn:   # committed now, so a failure can still be recorded against these runs
            demand_run_id = conn.execute(insert(runs).values(
                model_type=MODEL_TYPE_DEMAND, model_name=artifacts.demand_model_name,
                model_version=artifacts.demand_model_version, **common).returning(runs.c.id)).scalar_one()
            stockout_run_id = conn.execute(insert(runs).values(
                model_type=MODEL_TYPE_STOCKOUT, model_name=artifacts.stockout_model_name,
                model_version=artifacts.stockout_model_version, demand_model_run_id=demand_run_id,
                **common).returning(runs.c.id)).scalar_one()

        try:
            run = predict(read_conn, data_cutoff, artifacts)
            with engine.begin() as conn:
                _save_predictions(conn, run, demand_run_id, stockout_run_id)
        except Exception as exc:
            with engine.begin() as conn:
                conn.execute(update(runs).where(runs.c.id.in_([demand_run_id, stockout_run_id])).values(
                    status=RUN_FAILED, error_message=str(exc)[:2000], completed_at=func.now()))
            raise
    return stockout_run_id


def _run_info(row) -> dict:
    return {
        "model_run_id": row.id, "model_type": row.model_type, "model_name": row.model_name,
        "model_version": row.model_version, "feature_version": row.feature_version, "status": row.status,
        "prediction_count": row.prediction_count, "started_at": row.started_at, "completed_at": row.completed_at,
    }


def run_status(conn: Connection, stockout_run_id: int) -> dict:
    """Status of one refresh, identified by its stockout run."""
    stockout = conn.execute(select(runs).where(runs.c.id == stockout_run_id)).one()
    demand = conn.execute(select(runs).where(runs.c.id == stockout.demand_model_run_id)).one()
    return {
        "status": stockout.status,
        "data_cutoff_date": stockout.data_cutoff_date,
        "prediction_date": stockout.prediction_date,
        "completed_at": stockout.completed_at,
        "forecast_count": demand.prediction_count,
        "stockout_count": stockout.prediction_count,
        "demand_forecast": _run_info(demand),
        "stockout": _run_info(stockout),
    }


def latest_completed_run_id(conn: Connection) -> int | None:
    """The newest successful refresh, identified by its stockout run: a completed stockout run whose demand_forecast run
    also completed for the same data cutoff and prediction date (both complete in the same transaction, so this only
    excludes inconsistent rows). Running and failed runs are never picked; ties on completed_at go to the higher id."""
    demand = runs.alias("demand")
    return conn.execute(
        select(runs.c.id)
        .join(demand, demand.c.id == runs.c.demand_model_run_id)
        .where(runs.c.model_type == MODEL_TYPE_STOCKOUT, runs.c.status == RUN_COMPLETED,
               demand.c.model_type == MODEL_TYPE_DEMAND, demand.c.status == RUN_COMPLETED,
               demand.c.data_cutoff_date == runs.c.data_cutoff_date,
               demand.c.prediction_date == runs.c.prediction_date)
        .order_by(runs.c.completed_at.desc(), runs.c.id.desc())
        .limit(1)
    ).scalar()
