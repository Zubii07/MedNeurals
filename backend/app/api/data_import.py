import datetime
from typing import Literal

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.database.connection import engine
from app.schemas.data_import import ImportResult
from app.services.csv_import import CsvImportError, import_dataset

router = APIRouter(prefix="/data", tags=["data import"])

Dataset = Literal[
    "hospitals", "categories", "units_of_measure", "stores", "departments", "medical_items", "suppliers",
    "supplier_items", "item_department_usage", "calendar", "demand", "daily_inventory", "purchase_orders",
    "stock_transfers", "stockout_events",
]


@router.post("/import", response_model=ImportResult)
def import_csv(
    dataset: Dataset = Form(...),
    file: UploadFile = File(...),
    cutoff: datetime.date | None = Form(None),
) -> ImportResult:
    """Validate one CSV and load it into its table. Rows already in the DB are not duplicated."""
    try:
        result = import_dataset(engine, dataset, file.file, filename=file.filename, cutoff=cutoff)
    except CsvImportError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ImportResult(**result)
