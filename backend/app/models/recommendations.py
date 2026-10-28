import datetime
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base

ACTION_PURCHASE = "PURCHASE"
ACTION_TRANSFER = "TRANSFER"
ACTION_EXPEDITE = "EXPEDITE_PO"
ACTION_NONE = "NONE"
PRIORITY_HIGH = "HIGH"
PRIORITY_MODERATE = "MODERATE"
PRIORITY_LOW = "LOW"
STATUS_PENDING = "PENDING"


class Recommendation(Base):

    __tablename__ = "recommendations"
    __table_args__ = (
        UniqueConstraint("model_run_id", "item_id", "store_id", postgresql_nulls_not_distinct=True),
        CheckConstraint("action IN ('PURCHASE', 'TRANSFER', 'EXPEDITE_PO', 'NONE')", name="action"),
        CheckConstraint("priority IN ('HIGH', 'MODERATE', 'LOW')", name="priority"),
        CheckConstraint("status IN ('PENDING', 'ACCEPTED', 'ADJUSTED', 'REJECTED')", name="status"),
        CheckConstraint("recommended_quantity >= 0 AND transfer_qty >= 0", name="quantities"),
        CheckConstraint("(action = 'TRANSFER') = (store_id IS NOT NULL)", name="transfer_store"),
        Index("ix_recommendations_item_id", "item_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    model_run_id: Mapped[int] = mapped_column(ForeignKey("model_runs.id"))           # the stockout run
    demand_model_run_id: Mapped[int] = mapped_column(ForeignKey("model_runs.id"))    # the forecast run it used
    prediction_date: Mapped[datetime.date] = mapped_column(Date)
    data_cutoff_date: Mapped[datetime.date] = mapped_column(Date)
    item_id: Mapped[str] = mapped_column(ForeignKey("medical_items.item_id"))
    supplier_id: Mapped[str] = mapped_column(ForeignKey("suppliers.supplier_id"))
    store_id: Mapped[str | None] = mapped_column(ForeignKey("stores.store_id"))                         # TRANSFER only
    purchase_order_id: Mapped[str | None] = mapped_column(ForeignKey("purchase_orders.purchase_order_id"))  # EXPEDITE_PO only
    action: Mapped[str] = mapped_column(String(20))
    priority: Mapped[str] = mapped_column(String(10))

    # inputs (units: item UOM; days)
    ved_class: Mapped[str] = mapped_column(String(5))
    z_value: Mapped[float] = mapped_column(Float)
    forecast_p50: Mapped[float] = mapped_column(Float)           # daily demand, all sub-stores
    demand_std: Mapped[float] = mapped_column(Float)             # daily demand std, from P90 - P50
    lead_time: Mapped[float] = mapped_column(Float)
    lead_time_std: Mapped[float] = mapped_column(Float)
    lead_time_sample_size: Mapped[int] = mapped_column(Integer)
    current_stock: Mapped[int] = mapped_column(Integer)          # central store on hand
    on_order_qty: Mapped[int] = mapped_column(Integer)           # open PO quantity
    open_po_count: Mapped[int] = mapped_column(Integer)
    stockout_probability: Mapped[float] = mapped_column(Float)   # max over sub-stores; that store's on TRANSFER rows
    pack_size: Mapped[int] = mapped_column(Integer)
    moq_packs: Mapped[int | None] = mapped_column(Integer)

    # outputs
    inventory_position: Mapped[int] = mapped_column(Integer)
    safety_stock: Mapped[float] = mapped_column(Float)
    reorder_point: Mapped[float] = mapped_column(Float)
    order_up_to_level: Mapped[float] = mapped_column(Float)
    recommended_quantity: Mapped[int] = mapped_column(Integer)
    transfer_qty: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(10), default=STATUS_PENDING, server_default=STATUS_PENDING)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    model_run: Mapped[Any] = relationship("ModelRun", foreign_keys=[model_run_id])
    demand_model_run: Mapped[Any] = relationship("ModelRun", foreign_keys=[demand_model_run_id])
    item: Mapped[Any] = relationship("MedicalItem")
