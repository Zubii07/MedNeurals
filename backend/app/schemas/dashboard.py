import datetime
from typing import Literal

from pydantic import BaseModel

from app.schemas.predictions import PredictionRun
from app.schemas.reads import Page, ProductSummary
from app.schemas.recommendations import RecommendationRow
from app.schemas.suppliers import LeadTime


class RiskCounts(BaseModel):
    URGENT: int
    REVIEW: int
    LOW: int


class PriorityCounts(BaseModel):
    HIGH: int
    MODERATE: int
    LOW: int


class RecommendationSet(BaseModel):
    """Which saved recommendation set a response uses. Only the set of the latest prediction run counts as current."""
    # "current": the latest prediction run has a set. "missing": it has none (generation failed or was not run;
    # POST /recommendations/refresh creates it). Older sets are never counted as current.
    status: Literal["current", "missing"]
    model_run_id: int | None                    # stockout run of the set used (None when missing)
    generated_at: datetime.datetime | None
    latest_available_model_run_id: int | None   # newest run that has any set (older than the latest run when missing)


class DashboardSummary(BaseModel):
    total_items: int                             # all rows in medical_items (the item master has no active/status column)
    latest_data_date: datetime.date | None       # newest daily_inventory date in the DB (may be newer than the run cutoff)
    latest_prediction_timestamp: datetime.datetime | None   # completed_at of the latest successful refresh
    model_versions: dict[str, str] | None        # model_type -> model_version of that refresh
    prediction_run: PredictionRun | None         # the refresh all prediction counts come from (None: no successful run)
    # Each item counted once, at its highest risk level over its sub-stores.
    stockout_risk_counts: RiskCounts | None
    items_without_stockout_prediction: int | None
    recommendation_set: RecommendationSet
    # Each item counted once, at its highest priority over its rows (item row + TRANSFER rows). None when missing.
    recommendation_priority_counts: PriorityCounts | None
    # Distinct items with at least one row of the current set that is not (action NONE and priority LOW).
    items_needing_attention: int | None


class ForecastRow(BaseModel):
    item_id: str
    item_name: str
    unit: str
    store_id: str
    store_name: str
    horizon: int                    # 1-4 = H1-H4, weeks ahead of the last complete demand week
    target_week: datetime.date      # Monday of the forecast week
    p50: float
    p90: float
    model_run_id: int               # demand_forecast run


class StockoutRiskRow(BaseModel):
    item_id: str
    item_name: str
    store_id: str
    store_name: str
    probability: float              # P(stockout within horizon_days of prediction_date)
    risk_level: str                 # URGENT / REVIEW / LOW from the saved thresholds
    horizon_days: int
    threshold_review: float
    threshold_urgent: float
    model_run_id: int               # stockout run


class ForecastPage(Page[ForecastRow]):
    run: PredictionRun              # model versions, data cutoff, prediction date and timestamp of every row


class StockoutRiskPage(Page[StockoutRiskRow]):
    run: PredictionRun


class StoreStock(BaseModel):
    store_id: str
    store_name: str
    closing_qty: int


class CurrentStock(BaseModel):
    """From daily_inventory (live data, not part of the prediction run)."""
    as_of_date: datetime.date
    central_store_qty: int | None
    total_qty: int
    by_store: list[StoreStock]


class OpenPurchaseOrder(BaseModel):
    purchase_order_id: str
    supplier_id: str
    order_date: datetime.date
    expected_delivery_date: datetime.date
    ordered_quantity: int


class OpenOrders(BaseModel):
    """From purchase_orders (live): ordered on or before as_of_date, not received by then, not cancelled."""
    as_of_date: datetime.date
    quantity: int
    orders: list[OpenPurchaseOrder]


class PreferredSupplier(BaseModel):
    """supplier_items + Phase 8 statistics of the supplier's routine orders known on as_of (live data)."""
    supplier_id: str
    supplier_name: str
    minimum_order_quantity: int     # packs
    contract_lead_time_days: int
    as_of: datetime.date | None     # the run's prediction date (what the recommendation saw); None = all orders
    lead_time: LeadTime
    on_time_rate: float | None
    fill_rate: float | None


class HorizonTotal(BaseModel):
    horizon: int
    target_week: datetime.date
    p50: float                      # sum of the sub-store P50s
    p90_sum: float                  # sum of the sub-store P90s (not a hospital-level P90)


class ItemForecast(BaseModel):
    totals: list[HorizonTotal]
    by_store: list[ForecastRow]


class ItemStockout(BaseModel):
    highest: StockoutRiskRow | None
    by_store: list[StockoutRiskRow]  # highest probability first


class ItemRecommendation(BaseModel):
    """Persisted Phase 9 output for this item, from the latest prediction run's set only."""
    recommendation_set: RecommendationSet
    # "available": rows found. "item_not_included": the set exists but the engine skipped this item (incomplete
    # inputs; the reason is not stored). "set_missing": the latest run has no set.
    item_status: Literal["available", "item_not_included", "set_missing"]
    rows: list[RecommendationRow]    # item-level row (PURCHASE / EXPEDITE_PO / NONE) and TRANSFER rows


class ProductAnalysis(BaseModel):
    item: ProductSummary
    prediction_run: PredictionRun | None          # None: no successful prediction run
    forecast: ItemForecast | None                 # saved predictions of that run
    stockout_risk: ItemStockout | None
    recommendation: ItemRecommendation | None     # None only when there is no prediction run
    current_stock: CurrentStock | None            # contextual data below: not from the run
    open_purchase_orders: OpenOrders | None
    preferred_suppliers: list[PreferredSupplier]
