import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base

MODEL_TYPE_DEMAND = "demand_forecast"
MODEL_TYPE_STOCKOUT = "stockout"
RUN_RUNNING = "running"
RUN_COMPLETED = "completed"
RUN_FAILED = "failed"


class ModelRun(Base):
    """One model applied to one data cutoff. A prediction refresh creates a demand_forecast run and a stockout run;
    the stockout run points to the forecast run whose output fed its fc_next_n_* features. Runs are never updated
    after they finish, so every saved prediction stays traceable to its model, version and cutoff."""

    __tablename__ = "model_runs"
    __table_args__ = (
        CheckConstraint(f"model_type IN ('{MODEL_TYPE_DEMAND}', '{MODEL_TYPE_STOCKOUT}')", name="model_type"),
        CheckConstraint(f"status IN ('{RUN_RUNNING}', '{RUN_COMPLETED}', '{RUN_FAILED}')", name="status"),
        Index("ix_model_runs_type_status_completed_at", "model_type", "status", "completed_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    model_type: Mapped[str] = mapped_column(String(20))
    model_name: Mapped[str] = mapped_column(String(100))
    model_version: Mapped[str] = mapped_column(String(50))
    feature_version: Mapped[str] = mapped_column(String(50))
    data_cutoff_date: Mapped[datetime.date] = mapped_column(Date)
    prediction_date: Mapped[datetime.date] = mapped_column(Date)
    demand_model_run_id: Mapped[int | None] = mapped_column(ForeignKey("model_runs.id"))
    status: Mapped[str] = mapped_column(String(20))
    prediction_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    error_message: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(timezone=True))

    demand_model_run: Mapped[Any] = relationship("ModelRun", remote_side=[id])


class ForecastPrediction(Base):
    __tablename__ = "forecast_predictions"
    __table_args__ = (
        UniqueConstraint("model_run_id", "store_id", "item_id", "horizon"),
        CheckConstraint("horizon BETWEEN 1 AND 4", name="horizon"),
        Index("ix_forecast_predictions_item_store", "item_id", "store_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    model_run_id: Mapped[int] = mapped_column(ForeignKey("model_runs.id"))
    store_id: Mapped[str] = mapped_column(ForeignKey("stores.store_id"))
    item_id: Mapped[str] = mapped_column(ForeignKey("medical_items.item_id"))
    prediction_date: Mapped[datetime.date] = mapped_column(Date)
    horizon: Mapped[int] = mapped_column(SmallInteger)            # weeks ahead of the last complete demand week
    target_week: Mapped[datetime.date] = mapped_column(Date)      # Monday of the forecast week
    p50: Mapped[float] = mapped_column(Float)
    p90: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    model_run: Mapped[Any] = relationship("ModelRun")


class StockoutPrediction(Base):
    __tablename__ = "stockout_predictions"
    __table_args__ = (
        UniqueConstraint("model_run_id", "store_id", "item_id"),
        CheckConstraint("probability BETWEEN 0 AND 1", name="probability"),
        CheckConstraint("risk_level IN ('URGENT', 'REVIEW', 'LOW')", name="risk_level"),
        Index("ix_stockout_predictions_item_store", "item_id", "store_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    model_run_id: Mapped[int] = mapped_column(ForeignKey("model_runs.id"))
    store_id: Mapped[str] = mapped_column(ForeignKey("stores.store_id"))
    item_id: Mapped[str] = mapped_column(ForeignKey("medical_items.item_id"))
    prediction_date: Mapped[datetime.date] = mapped_column(Date)
    horizon_days: Mapped[int] = mapped_column(SmallInteger)
    probability: Mapped[float] = mapped_column(Float)
    risk_level: Mapped[str] = mapped_column(String(10))
    # The two saved thresholds risk_level was derived from (the plan's threshold_used).
    threshold_review: Mapped[float] = mapped_column(Float)
    threshold_urgent: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    model_run: Mapped[Any] = relationship("ModelRun")
