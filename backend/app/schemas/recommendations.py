import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

Decision = Literal["ACCEPTED", "ADJUSTED", "REJECTED"]
MAX_REASON_LENGTH = 1000


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
    purchase_order_expected_delivery_date: datetime.date | None = None   # that PO's expected date (live, read-only)
    purchase_order_received: bool | None = None                          # True once that PO has a receipt date
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


class DecisionRequest(BaseModel):
    """POST /recommendations/{id}/decision. What goes with each decision:
    ACCEPTED: nothing else (an optional note in `reason`).
    ADJUSTED: exactly one of adjusted_quantity (PURCHASE / TRANSFER rows) or adjusted_expected_date (EXPEDITE_PO rows),
              and a reason.
    REJECTED: a reason.
    Which field fits the row's action is checked by the endpoint against the saved row."""
    decision: Decision
    adjusted_quantity: int | None = Field(default=None, ge=0)
    adjusted_expected_date: datetime.date | None = None
    reason: str | None = Field(default=None, max_length=MAX_REASON_LENGTH)

    @model_validator(mode="after")
    def _consistent(self):
        self.reason = (self.reason or "").strip() or None
        adjustments = [v for v in (self.adjusted_quantity, self.adjusted_expected_date) if v is not None]
        if self.decision == "ACCEPTED" and adjustments:
            raise ValueError("an accepted recommendation has no adjusted value; use ADJUSTED to change it")
        if self.decision == "REJECTED" and adjustments:
            raise ValueError("a rejected recommendation has no adjusted value")
        if self.decision == "ADJUSTED" and len(adjustments) != 1:
            raise ValueError("an adjustment changes exactly one value: the quantity, or the delivery date for an expedite")
        if self.decision != "ACCEPTED" and self.reason is None:
            raise ValueError("give a short reason for the adjustment or rejection")
        return self


class RecommendationDecisionOut(BaseModel):
    """The officer's decision on one row, as stored. Original values are copied at decision time."""
    id: int
    recommendation_id: int
    decision: Decision
    decided_by_id: int
    decided_by_name: str
    decided_at: datetime.datetime
    original_quantity: int | None             # PURCHASE: recommended quantity; TRANSFER: transfer quantity
    adjusted_quantity: int | None
    original_expected_date: datetime.date | None   # EXPEDITE_PO: the purchase order's expected delivery date then
    adjusted_expected_date: datetime.date | None
    reason: str | None


class DecisionHistoryRow(RecommendationDecisionOut):
    """GET /recommendations/decisions: a decision with the recommendation it was made on."""
    product_id: str
    product_name: str
    unit: str
    store_id: str | None
    store_name: str | None
    action: str
    priority: str
    recommended_purchase_quantity: int
    transfer_quantity: int
    purchase_order_id: str | None
    model_run_id: int
    prediction_date: datetime.date


class DecisionHistoryPage(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[DecisionHistoryRow]


class RecommendationRow(BaseModel):
    id: int
    product_id: str
    product_name: str
    unit: str
    store_id: str | None                  # TRANSFER rows only
    store_name: str | None
    action: str                           # PURCHASE / TRANSFER / EXPEDITE_PO / NONE
    priority: str                         # HIGH / MODERATE / LOW
    recommended_purchase_quantity: int
    transfer_quantity: int
    safety_stock: float
    reorder_point: float
    order_up_to_level: float
    inventory_position: int
    reason: str
    status: str                           # PENDING until the officer decides; then mirrors decision.decision
    decision: RecommendationDecisionOut | None = None
    details: RecommendationDetails
    model_run_id: int
    demand_model_run_id: int
    prediction_date: datetime.date
    data_cutoff_date: datetime.date
    created_at: datetime.datetime


class RecommendationPage(BaseModel):
    model_run_id: int
    generated_at: datetime.datetime       # when this set was written
    latest_prediction_run_id: int | None  # newest completed prediction refresh (stockout run)
    latest_prediction_date: datetime.date | None
    # "current": this set belongs to the newest completed refresh. "stale": a newer refresh exists without its own
    # recommendations (its recommendation step failed or was not run); POST /recommendations/refresh generates them.
    freshness: Literal["current", "stale"]
    demand_model_run_id: int
    prediction_date: datetime.date
    data_cutoff_date: datetime.date
    # Officers decide only on the newest set with recommendations; an older set is read-only history.
    is_latest_set: bool
    status_counts: dict[str, int]         # PENDING / ACCEPTED / ADJUSTED / REJECTED over the whole set (filters ignored)
    total: int
    limit: int
    offset: int
    items: list[RecommendationRow]
