import datetime

from pydantic import BaseModel


class DataPeriod(BaseModel):
    first_order_date: datetime.date | None
    last_order_date: datetime.date | None
    last_receipt_date: datetime.date | None


class OrderCounts(BaseModel):
    total: int
    emergency_excluded: int
    completed: int
    open: int
    cancelled: int
    missing_receipt_date: int
    other_status: int


class LeadTime(BaseModel):
    sample_size: int
    mean_days: float | None
    median_days: float | None
    std_dev_days: float | None
    min_days: int | None
    max_days: int | None


class OnTimeDelivery(BaseModel):
    sample_size: int
    on_time_count: int
    delayed_count: int
    rate: float | None


class FillRate(BaseModel):
    sample_size: int
    ordered_quantity: int
    accepted_quantity: int
    partially_filled_count: int
    rate: float | None


class SupplierPerformance(BaseModel):
    supplier_id: str
    supplier_name: str
    as_of: datetime.date | None
    include_emergency: bool
    data_period: DataPeriod
    order_counts: OrderCounts
    lead_time: LeadTime
    on_time_delivery: OnTimeDelivery
    fill_rate: FillRate
    unavailable: dict[str, str]
