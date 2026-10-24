import datetime
from typing import Any
from sqlalchemy import BigInteger, Boolean, Date, ForeignKey, Index, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database.base import Base


# Many-to-one relationships only: no reverse collections on these large tables.


class Demand(Base):
    __tablename__ = "demand"
    __table_args__ = (
        Index("ix_demand_item_store_date", "item_id", "store_id", "demand_date"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    demand_id: Mapped[str] = mapped_column(String(20), unique=True)
    demand_date: Mapped[datetime.date] = mapped_column(Date, index=True)
    store_id: Mapped[str] = mapped_column(ForeignKey("stores.store_id"))
    department_id: Mapped[str] = mapped_column(ForeignKey("departments.department_id"))
    item_id: Mapped[str] = mapped_column(ForeignKey("medical_items.item_id"))
    demand_quantity: Mapped[int] = mapped_column(Integer)
    demand_type: Mapped[str] = mapped_column(String(50))
    is_emergency_related: Mapped[bool] = mapped_column(Boolean)
    source: Mapped[str] = mapped_column(String(50))

    store: Mapped[Any] = relationship("Store")
    department: Mapped[Any] = relationship("Department")
    item: Mapped[Any] = relationship("MedicalItem")


class DailyInventory(Base):
    __tablename__ = "daily_inventory"
    __table_args__ = (
        UniqueConstraint("date", "store_id", "item_id"),
        Index("ix_daily_inventory_item_store_date", "item_id", "store_id", "date"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    date: Mapped[datetime.date] = mapped_column(Date)
    store_id: Mapped[str] = mapped_column(ForeignKey("stores.store_id"))
    item_id: Mapped[str] = mapped_column(ForeignKey("medical_items.item_id"))
    opening_qty: Mapped[int] = mapped_column(Integer)
    received_qty: Mapped[int] = mapped_column(Integer)
    demand_qty: Mapped[int] = mapped_column(Integer)
    issued_qty: Mapped[int] = mapped_column(Integer)
    unmet_qty: Mapped[int] = mapped_column(Integer)
    closing_qty: Mapped[int] = mapped_column(Integer)
    on_order_qty: Mapped[int] = mapped_column(Integer)
    is_stockout: Mapped[bool] = mapped_column(Boolean)

    store: Mapped[Any] = relationship("Store")
    item: Mapped[Any] = relationship("MedicalItem")


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"
    __table_args__ = (
        Index("ix_purchase_orders_item_order_date", "item_id", "order_date"),
        Index("ix_purchase_orders_supplier_order_date", "supplier_id", "order_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    purchase_order_id: Mapped[str] = mapped_column(String(20), unique=True)
    supplier_id: Mapped[str] = mapped_column(ForeignKey("suppliers.supplier_id"))
    item_id: Mapped[str] = mapped_column(ForeignKey("medical_items.item_id"))
    order_date: Mapped[datetime.date] = mapped_column(Date)
    expected_delivery_date: Mapped[datetime.date] = mapped_column(Date)
    receipt_date: Mapped[datetime.date | None] = mapped_column(Date)
    lead_time_days: Mapped[int | None] = mapped_column(Integer)
    ordered_packs: Mapped[int] = mapped_column(Integer)
    ordered_quantity: Mapped[int] = mapped_column(Integer)
    accepted_quantity: Mapped[int] = mapped_column(Integer)
    unit_price_per_pack: Mapped[float] = mapped_column(Numeric(12, 2))
    is_emergency: Mapped[bool] = mapped_column(Boolean)
    premium_pct: Mapped[float] = mapped_column(Numeric(6, 2))
    status: Mapped[str] = mapped_column(String(20), index=True)
    line_amount_pkr: Mapped[float] = mapped_column(Numeric(14, 2))

    supplier: Mapped[Any] = relationship("Supplier")
    item: Mapped[Any] = relationship("MedicalItem")


class StockTransfer(Base):
    __tablename__ = "stock_transfers"
    __table_args__ = (
        UniqueConstraint("transfer_date", "to_store_id", "item_id"),
        Index("ix_stock_transfers_item_to_store", "item_id", "to_store_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    transfer_date: Mapped[datetime.date] = mapped_column(Date)
    from_store_id: Mapped[str] = mapped_column(ForeignKey("stores.store_id"))
    to_store_id: Mapped[str] = mapped_column(ForeignKey("stores.store_id"))
    item_id: Mapped[str] = mapped_column(ForeignKey("medical_items.item_id"))
    requested_qty: Mapped[int] = mapped_column(Integer)
    shipped_qty: Mapped[int] = mapped_column(Integer)
    arrival_date: Mapped[datetime.date] = mapped_column(Date)

    from_store: Mapped[Any] = relationship("Store", foreign_keys=[from_store_id])
    to_store: Mapped[Any] = relationship("Store", foreign_keys=[to_store_id])
    item: Mapped[Any] = relationship("MedicalItem")


class StockoutEvent(Base):
    __tablename__ = "stockout_events"
    __table_args__ = (
        Index("ix_stockout_events_item_store_start", "item_id", "store_id", "start_date"),
    )

    stockout_event_id: Mapped[str] = mapped_column(String(20), primary_key=True)
    store_id: Mapped[str] = mapped_column(ForeignKey("stores.store_id"))
    item_id: Mapped[str] = mapped_column(ForeignKey("medical_items.item_id"))
    start_date: Mapped[datetime.date] = mapped_column(Date)
    end_date: Mapped[datetime.date] = mapped_column(Date)
    duration_days: Mapped[int] = mapped_column(Integer)
    shortfall_qty: Mapped[int] = mapped_column(Integer)
    cause: Mapped[str] = mapped_column(String(50))
    severity: Mapped[str] = mapped_column(String(20))

    store: Mapped[Any] = relationship("Store")
    item: Mapped[Any] = relationship("MedicalItem")
