import datetime

from pydantic import BaseModel, ConfigDict


class ReadModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page[T](BaseModel):
    total: int
    limit: int
    offset: int
    items: list[T]


class ProductSummary(ReadModel):
    item_id: str
    item_name: str
    category_id: str
    category_name: str
    sub_category: str | None
    uom: str
    uom_per_purchase_pack: int
    criticality: str
    ved_class: str
    unit_cost_pkr: float
    nominal_lead_time_days: int


class ProductSupplier(ReadModel):
    supplier_item_id: str
    supplier_id: str
    unit_price: float
    minimum_order_quantity: int
    preferred_supplier_flag: bool
    lead_time_days: int
    lead_time_variability: str
    supply_status: str
    contract_start_date: datetime.date
    contract_end_date: datetime.date


class ProductDetail(ProductSummary):
    hospital_id: str
    family_key: str
    item_description: str | None
    primary_cost_centre: str | None
    material: str | None
    sterile_flag: bool
    purchase_pack_description: str | None
    size: str | None
    gauge: str | None
    length: str | None
    target_population: str
    shelf_life_days: int
    demand_archetype: str
    imported_flag: bool
    storage_condition: str | None
    storage_temperature: str | None
    seasonality_profile: str | None
    variant_demand_weight: float
    supplier_items: list[ProductSupplier]


class InventoryRow(ReadModel):
    date: datetime.date
    store_id: str
    item_id: str
    opening_qty: int
    received_qty: int
    demand_qty: int
    issued_qty: int
    unmet_qty: int
    closing_qty: int
    on_order_qty: int
    is_stockout: bool


class DemandRow(ReadModel):
    demand_id: str
    demand_date: datetime.date
    store_id: str
    department_id: str
    item_id: str
    demand_quantity: int
    demand_type: str
    is_emergency_related: bool
    source: str


class PurchaseOrderRow(ReadModel):
    purchase_order_id: str
    supplier_id: str
    item_id: str
    order_date: datetime.date
    expected_delivery_date: datetime.date
    receipt_date: datetime.date | None
    lead_time_days: int | None
    ordered_packs: int
    ordered_quantity: int
    accepted_quantity: int
    unit_price_per_pack: float
    is_emergency: bool
    premium_pct: float
    status: str
    line_amount_pkr: float


class SupplierRow(ReadModel):
    supplier_id: str
    supplier_code: str
    supplier_name: str
    supplier_type: str
    city: str
    region: str
    payment_terms: str
    reliability_class: str
    typical_lead_time_days: int
    lead_time_variability: str
    minimum_order_value: float
    active_flag: bool
