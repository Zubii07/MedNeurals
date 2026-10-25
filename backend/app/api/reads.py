import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session, selectinload
from app.database.connection import get_db
from app.models import DailyInventory, Demand, MedicalItem, PurchaseOrder, Supplier, SupplierItem
from app.schemas.reads import (
    DemandRow,
    InventoryRow,
    Page,
    ProductDetail,
    ProductSummary,
    PurchaseOrderRow,
    SupplierRow,
)

# Read-only views of the imported tables, used to verify the data in PostgreSQL. No aggregation here.
router = APIRouter()


def pagination(
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
) -> dict[str, int]:
    return {"limit": limit, "offset": offset}


def check_date_range(start_date: datetime.date | None, end_date: datetime.date | None) -> None:
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=400, detail="start_date must be on or before end_date")


def paginate(db: Session, query: Select, page: dict[str, int]) -> dict:
    total = db.scalar(select(func.count()).select_from(query.order_by(None).subquery()))
    rows = db.scalars(query.limit(page["limit"]).offset(page["offset"])).all()
    return {"total": total, **page, "items": rows}


@router.get("/products", response_model=Page[ProductSummary], tags=["products"])
def list_products(
    search: str | None = Query(None, description="Case-insensitive match on item_id or item_name"),
    category_id: str | None = None,
    ved_class: str | None = None,
    page: dict[str, int] = Depends(pagination),
    db: Session = Depends(get_db),
):
    query = select(MedicalItem).order_by(MedicalItem.item_id)
    if search:
        pattern = f"%{search}%"
        query = query.where(MedicalItem.item_id.ilike(pattern) | MedicalItem.item_name.ilike(pattern))
    if category_id:
        query = query.where(MedicalItem.category_id == category_id)
    if ved_class:
        query = query.where(MedicalItem.ved_class == ved_class)
    return paginate(db, query, page)


@router.get("/products/{item_id}", response_model=ProductDetail, tags=["products"])
def get_product(item_id: str, db: Session = Depends(get_db)):
    item = db.scalar(
        select(MedicalItem).where(MedicalItem.item_id == item_id).options(selectinload(MedicalItem.supplier_items))
    )
    if item is None:
        raise HTTPException(status_code=404, detail=f"Product {item_id} not found")
    return item


@router.get("/inventory", response_model=Page[InventoryRow], tags=["inventory"])
def list_inventory(
    item_id: str | None = None,
    store_id: str | None = None,
    start_date: datetime.date | None = None,
    end_date: datetime.date | None = None,
    stockout_only: bool = False,
    latest: bool = Query(False, description="Only the latest inventory date (on or before end_date): current stock"),
    page: dict[str, int] = Depends(pagination),
    db: Session = Depends(get_db),
):
    check_date_range(start_date, end_date)
    query = select(DailyInventory).order_by(
        DailyInventory.date.desc(), DailyInventory.store_id, DailyInventory.item_id
    )
    if item_id:
        query = query.where(DailyInventory.item_id == item_id)
    if store_id:
        query = query.where(DailyInventory.store_id == store_id)
    if start_date:
        query = query.where(DailyInventory.date >= start_date)
    if end_date:
        query = query.where(DailyInventory.date <= end_date)
    if stockout_only:
        query = query.where(DailyInventory.is_stockout)
    if latest:
        latest_date = select(func.max(DailyInventory.date))
        if end_date:
            latest_date = latest_date.where(DailyInventory.date <= end_date)
        query = query.where(DailyInventory.date == latest_date.scalar_subquery())
    return paginate(db, query, page)


@router.get("/demand", response_model=Page[DemandRow], tags=["demand"])
def list_demand(
    item_id: str | None = None,
    store_id: str | None = None,
    department_id: str | None = None,
    start_date: datetime.date | None = None,
    end_date: datetime.date | None = None,
    page: dict[str, int] = Depends(pagination),
    db: Session = Depends(get_db),
):
    check_date_range(start_date, end_date)
    query = select(Demand).order_by(Demand.demand_date.desc(), Demand.demand_id)
    if item_id:
        query = query.where(Demand.item_id == item_id)
    if store_id:
        query = query.where(Demand.store_id == store_id)
    if department_id:
        query = query.where(Demand.department_id == department_id)
    if start_date:
        query = query.where(Demand.demand_date >= start_date)
    if end_date:
        query = query.where(Demand.demand_date <= end_date)
    return paginate(db, query, page)


@router.get("/purchase-orders", response_model=Page[PurchaseOrderRow], tags=["purchase orders"])
def list_purchase_orders(
    item_id: str | None = None,
    supplier_id: str | None = None,
    status: str | None = Query(None, description="e.g. Open or Received"),
    start_date: datetime.date | None = Query(None, description="Earliest order_date"),
    end_date: datetime.date | None = Query(None, description="Latest order_date"),
    page: dict[str, int] = Depends(pagination),
    db: Session = Depends(get_db),
):
    check_date_range(start_date, end_date)
    query = select(PurchaseOrder).order_by(PurchaseOrder.order_date.desc(), PurchaseOrder.purchase_order_id)
    if item_id:
        query = query.where(PurchaseOrder.item_id == item_id)
    if supplier_id:
        query = query.where(PurchaseOrder.supplier_id == supplier_id)
    if status:
        query = query.where(PurchaseOrder.status == status)
    if start_date:
        query = query.where(PurchaseOrder.order_date >= start_date)
    if end_date:
        query = query.where(PurchaseOrder.order_date <= end_date)
    return paginate(db, query, page)


@router.get("/suppliers", response_model=Page[SupplierRow], tags=["suppliers"])
def list_suppliers(
    item_id: str | None = Query(None, description="Only suppliers linked to this item in supplier_items"),
    active_only: bool = False,
    page: dict[str, int] = Depends(pagination),
    db: Session = Depends(get_db),
):
    query = select(Supplier).order_by(Supplier.supplier_id)
    if item_id:
        query = query.where(
            Supplier.supplier_id.in_(select(SupplierItem.supplier_id).where(SupplierItem.item_id == item_id))
        )
    if active_only:
        query = query.where(Supplier.active_flag)
    return paginate(db, query, page)
