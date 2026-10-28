import datetime

from pydantic import BaseModel


class SkippedItem(BaseModel):
    item_id: str
    reason: str


class RecommendationSummary(BaseModel):
    """One generated recommendation set (one prediction refresh)."""
    model_run_id: int                     # stockout run
    demand_model_run_id: int              # forecast run it used
    prediction_date: datetime.date
    data_cutoff_date: datetime.date
    created: bool                         # False: the set already existed and was returned unchanged
    generated_at: datetime.datetime | None
    row_count: int
    item_count: int
    action_counts: dict[str, int]
    priority_counts: dict[str, int]
    skipped_count: int                    # items without a recommendation (incomplete inputs)
    skipped: list[SkippedItem] | None     # reasons; only when the set is created by this call


class RecommendationRefreshResult(BaseModel):
    """Recommendation step of POST /predictions/refresh. A failure here never undoes the saved predictions."""
    status: str                           # generated / failed
    summary: RecommendationSummary | None = None
    error: str | None = None


class RecommendationDetails(BaseModel):
    current_stock: int                    # central store on hand on the prediction date
    on_order_qty: int                     # open purchase orders
    open_po_count: int
    purchase_order_id: str | None         # the PO to expedite (EXPEDITE_PO)
    daily_demand_p50: float
    demand_std: float
    lead_time_days: float
    lead_time_std: float
    lead_time_sample_size: int
    ved_class: str
    z_value: float
    stockout_probability: float           # highest sub-store; this store's on TRANSFER rows
    pack_size: int
    moq_packs: int | None
    supplier_id: str
    supplier_name: str


class RecommendationRow(BaseModel):
    id: int
    product_id: str
    product_name: str
    unit: str
    store_id: str | None                  # TRANSFER rows only
    action: str                           # PURCHASE / TRANSFER / EXPEDITE_PO / NONE
    priority: str                         # HIGH / MODERATE / LOW
    recommended_purchase_quantity: int
    transfer_quantity: int
    safety_stock: float
    reorder_point: float
    order_up_to_level: float
    inventory_position: int
    reason: str
    status: str
    details: RecommendationDetails
    model_run_id: int
    demand_model_run_id: int
    prediction_date: datetime.date
    created_at: datetime.datetime


class RecommendationPage(BaseModel):
    model_run_id: int
    latest_prediction_run_id: int | None  # newest completed refresh (stockout run)
    is_latest: bool                       # False: this set belongs to an older refresh (e.g. the newest one failed)
    demand_model_run_id: int
    prediction_date: datetime.date
    data_cutoff_date: datetime.date
    total: int
    limit: int
    offset: int
    items: list[RecommendationRow]
