#Validation and cutoff tests for the CSV importer (pure pandas, no database).

import datetime
import pandas as pd
from app.services.csv_import import DATASETS, apply_cutoff, validate


def demand_frame(**overrides) -> pd.DataFrame:
    row = {
        "demand_id": "DMD-1", "demand_date": "2025-11-01", "store_id": "STR-002", "department_id": "ER",
        "item_id": "MED-000001", "demand_quantity": 3, "demand_type": "Clinical",
        "is_emergency_related": "N", "source": "Department_Activity",
    }
    row.update(overrides)
    return pd.DataFrame([row], index=[2])


KNOWN = {"store_id": {"STR-002"}, "department_id": {"ER"}, "item_id": {"MED-000001"}}


def reasons(df: pd.DataFrame) -> str:
    _, rejected = validate(df, DATASETS["demand"], KNOWN)
    return rejected["reject_reason"].iloc[0] if len(rejected) else ""


def test_valid_row_is_typed_for_the_db():
    valid, rejected = validate(demand_frame(), DATASETS["demand"], KNOWN)
    assert rejected.empty
    assert valid["demand_date"].iloc[0] == pd.Timestamp("2025-11-01")
    assert not valid["is_emergency_related"].iloc[0]


def test_bad_values_are_rejected_with_reasons():
    assert "demand_date: invalid date" in reasons(demand_frame(demand_date="2025-13-45"))
    assert "demand_quantity: negative value" in reasons(demand_frame(demand_quantity=-1))
    assert "demand_quantity: not a whole number" in reasons(demand_frame(demand_quantity=1.5))
    assert "item_id: unknown id" in reasons(demand_frame(item_id="MED-999999"))
    assert "is_emergency_related: invalid flag" in reasons(demand_frame(is_emergency_related="maybe"))
    assert "store_id: missing" in reasons(demand_frame(store_id=None))


def test_duplicate_key_rejects_later_copy_only():
    df = pd.concat([demand_frame(), demand_frame(demand_quantity=5)])
    df.index = [2, 3]
    valid, rejected = validate(df, DATASETS["demand"], KNOWN)
    assert len(valid) == 1 and valid["demand_quantity"].iloc[0] == 3
    assert rejected["row_number"].tolist() == [3]
    assert "duplicate demand_id in file" in rejected["reject_reason"].iloc[0]


def test_calendar_uses_day_first_dates():
    df = pd.DataFrame([{"date": "02/01/2023", "is_ramadan": "0", "is_eid": "0", "is_public_holiday": "0", "is_weekend": "1"}])
    valid, rejected = validate(df, DATASETS["calendar"], {})
    assert rejected.empty
    assert valid["date"].iloc[0] == pd.Timestamp("2023-01-02")


def test_cutoff_skips_later_rows():
    df = pd.concat([demand_frame(demand_date="2025-11-30"), demand_frame(demand_id="DMD-2", demand_date="2025-12-01")])
    kept, skipped = apply_cutoff(df, DATASETS["demand"], datetime.date(2025, 11, 30))
    assert skipped == 1 and kept["demand_id"].tolist() == ["DMD-1"]


def test_cutoff_shows_purchase_orders_as_open_if_received_later():
    po = pd.DataFrame([{
        "purchase_order_id": "PO2-1", "order_date": "2025-11-25", "receipt_date": "2025-12-03",
        "lead_time_days": 8.0, "accepted_quantity": 500, "status": "Received",
    }])
    kept, skipped = apply_cutoff(po, DATASETS["purchase_orders"], datetime.date(2025, 11, 30))
    row = kept.iloc[0]
    assert skipped == 0
    assert pd.isna(row["receipt_date"]) and pd.isna(row["lead_time_days"])
    assert row["accepted_quantity"] == 0 and row["status"] == "Open"
