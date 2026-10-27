import datetime
from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import text
from app.database.connection import engine
from app.schemas.suppliers import SupplierPerformance
from app.services.supplier_stats import compute_performance, supplier_orders

router = APIRouter(prefix="/suppliers", tags=["suppliers"])


@router.get("/{supplier_id}/performance", response_model=SupplierPerformance)
def supplier_performance(
    supplier_id: str,
    as_of: datetime.date | None = Query(None, description="Only orders placed and receipts known on or before this date"),
    include_emergency: bool = Query(False, description="Include expedited emergency orders (excluded by default)"),
) -> SupplierPerformance:
    """Lead time, on-time rate and fill rate from the supplier's completed purchase orders. Formulas, no ML."""
    with engine.connect() as conn:
        name = conn.execute(
            text("SELECT supplier_name FROM suppliers WHERE supplier_id = :id"), {"id": supplier_id}
        ).scalar()
        if name is None:
            raise HTTPException(status_code=404, detail=f"Supplier {supplier_id} not found")
        orders = supplier_orders(conn, supplier_id, as_of)
    stats = compute_performance(orders, as_of, include_emergency)
    return SupplierPerformance(supplier_id=supplier_id, supplier_name=name, **stats)
