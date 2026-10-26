"""CSV import: validate with pandas, bulk load with COPY + INSERT ... ON CONFLICT, track in uploads.

Column names, types, nullability, string lengths and foreign keys come from the SQLAlchemy tables,
so the only per-file configuration is in DATASETS below. CSV headers map to DB columns via lower().
"""

import datetime
import io
from dataclasses import dataclass, field
from pathlib import Path
from typing import IO, Any

import pandas as pd
from sqlalchemy import (
    Boolean,
    Date,
    Engine,
    Float,
    Integer,
    Numeric,
    Table,
    UniqueConstraint,
    insert,
    select,
    text,
    update,
)

from app.models import (
    CalendarDay,
    Category,
    DailyInventory,
    Demand,
    Department,
    Hospital,
    ItemDepartmentUsage,
    MedicalItem,
    PurchaseOrder,
    StockoutEvent,
    StockTransfer,
    Store,
    Supplier,
    SupplierItem,
    UnitOfMeasure,
    Upload,
)

REPORT_DIR = Path("import_reports")
COPY_CHUNK_ROWS = 100_000
BOOL_VALUES = {"Y": True, "N": False, "1": True, "0": False}


class CsvImportError(Exception):
    """The file as a whole cannot be imported (unreadable, missing headers, unknown dataset)."""


@dataclass
class DatasetSpec:
    table: Table
    filename: str
    conflict_cols: list[str]
    # DO UPDATE on conflict (masters + purchase_orders); otherwise DO NOTHING so history is never overwritten.
    update_on_conflict: bool
    cutoff_col: str | None = None
    date_format: str = "%Y-%m-%d"
    # (earlier, later) date pairs: a row is rejected when later < earlier.
    date_order: list[tuple[str, str]] = field(default_factory=list)


DATASETS: dict[str, DatasetSpec] = {
    "hospitals": DatasetSpec(Hospital.__table__, "01_master/hospital.csv", ["hospital_id"], True),
    "categories": DatasetSpec(Category.__table__, "01_master/categories.csv", ["category_id"], True),
    "units_of_measure": DatasetSpec(UnitOfMeasure.__table__, "01_master/units_of_measure.csv", ["uom_code"], True),
    "stores": DatasetSpec(Store.__table__, "01_master/stores.csv", ["store_id"], True),
    "departments": DatasetSpec(Department.__table__, "01_master/departments.csv", ["department_id"], True),
    "medical_items": DatasetSpec(MedicalItem.__table__, "01_master/medical_items.csv", ["item_id"], True),
    "suppliers": DatasetSpec(Supplier.__table__, "01_master/suppliers.csv", ["supplier_id"], True),
    "supplier_items": DatasetSpec(
        SupplierItem.__table__, "01_master/supplier_items.csv", ["supplier_item_id"], True,
        date_order=[("contract_start_date", "contract_end_date")],
    ),
    "item_department_usage": DatasetSpec(
        ItemDepartmentUsage.__table__, "01_master/item_department_usage.csv", ["item_department_usage_id"], True
    ),
    "calendar": DatasetSpec(CalendarDay.__table__, "01_master/calendar.csv", ["date"], False, date_format="%d/%m/%Y"),
    "demand": DatasetSpec(Demand.__table__, "02_transactions/demand.csv", ["demand_id"], False, "demand_date"),
    "daily_inventory": DatasetSpec(
        DailyInventory.__table__, "02_transactions/daily_inventory.csv", ["date", "store_id", "item_id"], False, "date"
    ),
    "purchase_orders": DatasetSpec(
        PurchaseOrder.__table__, "02_transactions/purchase_orders.csv", ["purchase_order_id"], True, "order_date",
        date_order=[("order_date", "expected_delivery_date"), ("order_date", "receipt_date")],
    ),
    "stock_transfers": DatasetSpec(
        StockTransfer.__table__, "02_transactions/stock_transfers.csv", ["transfer_date", "to_store_id", "item_id"],
        False, "transfer_date", date_order=[("transfer_date", "arrival_date")],
    ),
    "stockout_events": DatasetSpec(
        StockoutEvent.__table__, "02_transactions/stockout_events.csv", ["stockout_event_id"], False, "start_date",
        date_order=[("start_date", "end_date")],
    ),
}

# Foreign-key-safe order (stores before departments: departments.primary_store_id -> stores).
IMPORT_ORDER = list(DATASETS)
MASTER_DATASETS = IMPORT_ORDER[:10]


def data_columns(table: Table) -> list[str]:
    """Table columns that come from the CSV (everything except the DB-generated surrogate id)."""
    return [c.name for c in table.columns if c.name != "id"]


def unique_keys(spec: DatasetSpec) -> list[list[str]]:
    """Every unique key of the table (conflict key, PK, unique columns, unique constraints)."""
    keys = [spec.conflict_cols]
    pk = [c.name for c in spec.table.primary_key.columns if c.name != "id"]
    if pk:
        keys.append(pk)
    keys += [[c.name] for c in spec.table.columns if c.unique]
    keys += [[c.name for c in con.columns] for con in spec.table.constraints if isinstance(con, UniqueConstraint)]
    unique: list[list[str]] = []
    for key in keys:
        if key not in unique:
            unique.append(key)
    return unique


def read_csv(spec: DatasetSpec, source: str | Path | IO[bytes]) -> pd.DataFrame:
    """Read the CSV with DB column names. Non-numeric columns are read as category to keep big files small."""
    try:
        header = pd.read_csv(source, nrows=0).columns
        if hasattr(source, "seek"):
            source.seek(0)
        rename = {h: h.strip().lower() for h in header}
        missing = [c for c in data_columns(spec.table) if c not in rename.values()]
        if missing:
            raise CsvImportError(f"missing required columns: {', '.join(missing)}")
        numeric = {c.name for c in spec.table.columns if isinstance(c.type, (Integer, Numeric, Float))}
        dtype = {h: "category" for h, col in rename.items() if col not in numeric}
        df = pd.read_csv(source, dtype=dtype, usecols=[h for h, col in rename.items() if col in data_columns(spec.table)])
    except CsvImportError:
        raise
    except (ValueError, pd.errors.ParserError, UnicodeDecodeError) as exc:
        raise CsvImportError(f"cannot read CSV: {exc}") from exc
    df = df.rename(columns=rename)
    df.index = df.index + 2  # index = line number in the CSV file (line 1 is the header)
    return df


def apply_cutoff(df: pd.DataFrame, spec: DatasetSpec, cutoff: datetime.date | None) -> tuple[pd.DataFrame, int]:
    """Drop rows dated after the cutoff (counted as skipped) and show purchase orders as they were on the cutoff."""
    if cutoff is None or spec.cutoff_col is None:
        return df, 0
    cutoff_ts = pd.Timestamp(cutoff)
    dates = pd.to_datetime(df[spec.cutoff_col].astype(object), format=spec.date_format, errors="coerce")
    after = dates > cutoff_ts  # unparseable dates stay and are rejected by validate()
    df = df.loc[~after].copy()

    if spec.table.name == "purchase_orders":
        receipt = pd.to_datetime(df["receipt_date"].astype(object), format=spec.date_format, errors="coerce")
        not_yet_received = receipt > cutoff_ts
        for col in ["receipt_date", "status"]:
            df[col] = df[col].astype(object)
        df.loc[not_yet_received, ["receipt_date", "lead_time_days"]] = None
        df.loc[not_yet_received, "accepted_quantity"] = 0
        df.loc[not_yet_received, "status"] = "Open"
    return df, int(after.sum())


def validate(
    df: pd.DataFrame, spec: DatasetSpec, known_ids: dict[str, set[str]]
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Convert columns to DB types. Returns (valid rows typed for the DB, rejected raw rows + reject_reason).

    known_ids maps a foreign-key column name to the set of ids that exist in the referenced table.
    """
    reasons = pd.Series("", index=df.index, dtype=object)

    def reject(mask: pd.Series, reason: str) -> None:
        mask = mask.fillna(False).astype(bool)
        if mask.any():
            reasons.loc[mask] += reason + "; "

    out = pd.DataFrame(index=df.index)
    for col in spec.table.columns:
        if col.name == "id":
            continue
        raw = df[col.name]
        present = raw.notna()  # read_csv already turns empty fields into NaN

        if isinstance(col.type, Date):
            value = pd.to_datetime(raw.astype(object), format=spec.date_format, errors="coerce")
            reject(present & value.isna(), f"{col.name}: invalid date")
        elif isinstance(col.type, Boolean):
            # On a category column map() runs once per category, not once per row.
            value = raw.map(lambda v: BOOL_VALUES.get(str(v).strip()))
            reject(present & value.isna(), f"{col.name}: invalid flag (expected Y/N or 0/1)")
        elif isinstance(col.type, (Integer, Numeric, Float)):
            value = pd.to_numeric(raw, errors="coerce")
            reject(present & value.isna(), f"{col.name}: not a number")
            reject(value < 0, f"{col.name}: negative value")
            if isinstance(col.type, Integer):
                reject(value.notna() & (value != value.round()), f"{col.name}: not a whole number")
                value = value.where(value == value.round()).astype("Int64")
        else:
            value = raw
            length = getattr(col.type, "length", None)
            if length:
                too_long = present & raw.map(lambda v, limit=length: len(str(v)) > limit).astype(bool)
                reject(too_long, f"{col.name}: longer than {length}")

        if not col.nullable:
            reject(~present, f"{col.name}: missing")
        out[col.name] = value

    for fk in spec.table.foreign_keys:
        col = fk.parent.name
        if col in known_ids:
            reject(out[col].notna() & ~out[col].isin(known_ids[col]), f"{col}: unknown id")

    for earlier, later in spec.date_order:
        reject(out[later] < out[earlier], f"{later}: before {earlier}")

    for key in unique_keys(spec):
        reject(out[key].duplicated(keep="first") & out[key].notna().all(axis=1), f"duplicate {'+'.join(key)} in file")

    bad = reasons.ne("")
    rejected = df.loc[bad].copy()
    rejected.insert(0, "row_number", rejected.index)
    rejected["reject_reason"] = reasons[bad].str.rstrip("; ")
    return out.loc[~bad], rejected


def load_known_ids(conn: Any, spec: DatasetSpec) -> dict[str, set[str]]:
    """Ids present in every table referenced by a foreign key of this dataset."""
    known: dict[str, set[str]] = {}
    for fk in spec.table.foreign_keys:
        ref = fk.column
        known[fk.parent.name] = {str(v) for v in conn.execute(select(ref)).scalars()}
    return known


def bulk_upsert(conn: Any, spec: DatasetSpec, df: pd.DataFrame) -> int:
    """COPY rows into a temp table, then INSERT ... ON CONFLICT into the real table. Returns rows written."""
    table = spec.table.name
    cols = data_columns(spec.table)
    col_list = ", ".join(f'"{c}"' for c in cols)
    conn.execute(text(f"CREATE TEMP TABLE tmp_import ON COMMIT DROP AS SELECT {col_list} FROM {table} WITH NO DATA"))

    cursor = conn.connection.driver_connection.cursor()
    with cursor.copy(f"COPY tmp_import ({col_list}) FROM STDIN (FORMAT csv)") as copy:
        for start in range(0, len(df), COPY_CHUNK_ROWS):
            buffer = io.StringIO()
            df.iloc[start:start + COPY_CHUNK_ROWS][cols].to_csv(buffer, header=False, index=False, date_format="%Y-%m-%d")
            copy.write(buffer.getvalue())

    conflict = ", ".join(f'"{c}"' for c in spec.conflict_cols)
    sql = f"INSERT INTO {table} ({col_list}) SELECT {col_list} FROM tmp_import ON CONFLICT ({conflict}) "
    update_cols = [c for c in cols if c not in spec.conflict_cols]
    if spec.update_on_conflict and update_cols:
        # Only rows that actually changed are updated (and counted).
        sets = ", ".join(f'"{c}" = EXCLUDED."{c}"' for c in update_cols)
        current = ", ".join(f'{table}."{c}"' for c in update_cols)
        incoming = ", ".join(f'EXCLUDED."{c}"' for c in update_cols)
        sql += f"DO UPDATE SET {sets} WHERE ({current}) IS DISTINCT FROM ({incoming})"
    else:
        sql += "DO NOTHING"
    written = conn.execute(text(sql)).rowcount
    conn.execute(text("DROP TABLE tmp_import"))
    return written


def summarize_reasons(rejected: pd.DataFrame) -> str:
    counts = rejected["reject_reason"].str.split("; ").explode().value_counts()
    return "; ".join(f"{reason} ({n} rows)" for reason, n in counts.items())


def import_dataset(
    engine: Engine,
    dataset: str,
    source: str | Path | IO[bytes],
    filename: str | None = None,
    cutoff: datetime.date | None = None,
) -> dict[str, Any]:
    """Validate and load one CSV into its table, recording the import in uploads.

    Raises CsvImportError when the file as a whole is unusable; the upload is still recorded as failed.
    """
    if dataset not in DATASETS:
        raise CsvImportError(f"unknown dataset '{dataset}'; expected one of: {', '.join(DATASETS)}")
    spec = DATASETS[dataset]
    filename = filename or Path(str(source)).name
    uploads = Upload.__table__

    with engine.begin() as conn:
        upload_id = conn.execute(
            insert(uploads)
            .values(filename=filename, dataset_type=dataset, status="processing", cutoff_date=cutoff)
            .returning(uploads.c.id)
        ).scalar_one()

    result: dict[str, Any] = {"upload_id": upload_id, "dataset": dataset, "filename": filename, "cutoff_date": cutoff}
    try:
        df = read_csv(spec, source)
        result["rows_received"] = len(df)
        df, result["rows_skipped"] = apply_cutoff(df, spec, cutoff)
        with engine.begin() as conn:
            valid, rejected = validate(df, spec, load_known_ids(conn, spec))
            written = bulk_upsert(conn, spec, valid) if len(valid) else 0
    except Exception as exc:
        with engine.begin() as conn:
            conn.execute(
                update(uploads).where(uploads.c.id == upload_id).values(
                    status="failed", error_message=str(exc)[:2000], completed_at=datetime.datetime.now(datetime.UTC),
                    rows_received=result.get("rows_received", 0), rows_skipped=result.get("rows_skipped", 0),
                )
            )
        raise

    report_path = None
    if len(rejected):
        REPORT_DIR.mkdir(exist_ok=True)
        report_path = REPORT_DIR / f"{upload_id}_{dataset}_rejected.csv"
        rejected.to_csv(report_path, index=False)

    result.update(
        status="partial" if len(rejected) else "completed",
        rows_rejected=len(rejected),
        rows_accepted=len(valid),
        rows_written=written,
        rows_unchanged=len(valid) - written,  # already in the DB (identical, or kept by DO NOTHING)
        rejected_summary=summarize_reasons(rejected) if len(rejected) else None,
        rejected_report=str(report_path) if report_path else None,
        rejected_sample=rejected.head(20).astype(object).where(rejected.head(20).notna(), None).to_dict("records"),
    )
    with engine.begin() as conn:
        conn.execute(
            update(uploads).where(uploads.c.id == upload_id).values(
                status=result["status"],
                rows_received=result["rows_received"],
                rows_skipped=result["rows_skipped"],
                rows_accepted=result["rows_accepted"],
                rows_rejected=result["rows_rejected"],
                error_message=result["rejected_summary"],
                completed_at=datetime.datetime.now(datetime.UTC),
            )
        )
    return result

