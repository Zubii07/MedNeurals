# Phase 8: supplier statistics. The formulas are tested on hand-built orders with known answers; the endpoint tests
# need the imported PostgreSQL data and are skipped without it.

import datetime
import statistics

import pandas as pd
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from app.database.connection import engine
from app.main import app
from app.services.supplier_stats import ORDER_COLUMNS, compute_performance


def order(po_id, ordered_on, expected, received, ordered=100, accepted=None, status="Received", emergency=False):
    return {
        "purchase_order_id": po_id,
        "order_date": pd.Timestamp(ordered_on),
        "expected_delivery_date": pd.Timestamp(expected) if expected else pd.NaT,
        "receipt_date": pd.Timestamp(received) if received else pd.NaT,
        "ordered_quantity": ordered,
        "accepted_quantity": ordered if accepted is None and received else (accepted or 0),
        "is_emergency": emergency,
        "status": status,
    }


def frame(*rows) -> pd.DataFrame:
    return pd.DataFrame(list(rows), columns=ORDER_COLUMNS)


def test_completed_orders_metrics():
    stats = compute_performance(frame(
        order("A", "2025-01-01", "2025-01-11", "2025-01-11"),              # lead 10, on time (receipt == expected)
        order("B", "2025-01-01", "2025-01-11", "2025-01-15"),              # lead 14, late
        order("C", "2025-02-01", "2025-02-11", "2025-02-07", accepted=60),  # lead 6, on time, partial
        order("D", "2025-03-01", "2025-03-11", "2025-03-21", ordered=300),  # lead 20, late
    ))
    lead = stats["lead_time"]
    assert lead["sample_size"] == 4
    assert lead["mean_days"] == 12.5
    assert lead["median_days"] == 12.0  # mean of the middle two (10, 14)
    assert lead["std_dev_days"] == round(statistics.stdev([10, 14, 6, 20]), 2)
    assert (lead["min_days"], lead["max_days"]) == (6, 20)
    assert stats["on_time_delivery"] == {"sample_size": 4, "on_time_count": 2, "delayed_count": 2, "rate": 0.5}
    fill = stats["fill_rate"]
    assert (fill["ordered_quantity"], fill["accepted_quantity"]) == (600, 560)
    assert fill["rate"] == round(560 / 600, 4)
    assert fill["partially_filled_count"] == 1
    assert stats["data_period"] == {"first_order_date": datetime.date(2025, 1, 1),
                                    "last_order_date": datetime.date(2025, 3, 1),
                                    "last_receipt_date": datetime.date(2025, 3, 21)}
    assert stats["unavailable"] == {}


def test_open_cancelled_and_missing_receipt_are_excluded():
    stats = compute_performance(frame(
        order("A", "2025-01-01", "2025-01-11", "2025-01-11"),
        order("B", "2025-01-05", "2025-01-15", None, status="Open"),
        order("C", "2025-01-05", "2025-01-15", None, status="Cancelled", accepted=0),
        order("D", "2025-01-05", "2025-01-15", None, status="Received"),  # received but no receipt date
        order("E", "2025-01-05", "2025-01-15", None, status="On Hold"),
    ))
    assert stats["order_counts"] == {"total": 5, "emergency_excluded": 0, "completed": 1, "open": 1,
                                     "cancelled": 1, "missing_receipt_date": 1, "other_status": 1}
    assert stats["lead_time"]["sample_size"] == 1
    assert stats["fill_rate"]["ordered_quantity"] == 100  # only the completed order
    assert stats["on_time_delivery"]["rate"] == 1.0


def test_emergency_orders_excluded_by_default():
    rows = frame(
        order("A", "2025-01-01", "2025-01-21", "2025-01-21"),
        order("E", "2025-01-01", "2025-01-03", "2025-01-03", emergency=True),
    )
    routine = compute_performance(rows)
    assert routine["order_counts"]["emergency_excluded"] == 1
    assert routine["lead_time"]["mean_days"] == 20
    everything = compute_performance(rows, include_emergency=True)
    assert everything["order_counts"]["emergency_excluded"] == 0
    assert everything["lead_time"]["mean_days"] == 11


def test_as_of_treats_later_receipts_as_open():
    rows = frame(
        order("A", "2025-01-01", "2025-01-11", "2025-01-10"),
        order("B", "2025-01-20", "2025-01-30", "2025-02-05"),  # received after as_of
    )
    stats = compute_performance(rows, as_of=datetime.date(2025, 1, 31))
    assert stats["order_counts"]["completed"] == 1
    assert stats["order_counts"]["open"] == 1
    assert stats["data_period"]["last_receipt_date"] == datetime.date(2025, 1, 10)
    assert stats["on_time_delivery"]["delayed_count"] == 0


def test_over_delivery_is_capped_at_ordered_quantity():
    stats = compute_performance(frame(order("A", "2025-01-01", "2025-01-11", "2025-01-11", ordered=100, accepted=120)))
    assert stats["fill_rate"]["accepted_quantity"] == 100
    assert stats["fill_rate"]["rate"] == 1.0


def test_single_order_has_no_std_dev():
    stats = compute_performance(frame(order("A", "2025-01-01", "2025-01-11", "2025-01-08")))
    assert stats["lead_time"]["mean_days"] == 7
    assert stats["lead_time"]["std_dev_days"] is None
    assert "lead_time_std_dev" in stats["unavailable"]


def test_no_eligible_orders_returns_nulls():
    for rows in (frame(), frame(order("B", "2025-01-05", "2025-01-15", None, status="Open"))):
        stats = compute_performance(rows)
        assert stats["lead_time"]["mean_days"] is None
        assert stats["lead_time"]["median_days"] is None
        assert stats["on_time_delivery"]["rate"] is None
        assert stats["fill_rate"]["rate"] is None
        assert set(stats["unavailable"]) == {"lead_time", "on_time_rate", "fill_rate"}
        assert stats["data_period"]["last_receipt_date"] is None


def test_missing_expected_date_and_zero_ordered_quantity():
    stats = compute_performance(frame(order("A", "2025-01-01", None, "2025-01-08", ordered=0, accepted=0)))
    assert stats["lead_time"]["sample_size"] == 1
    assert stats["on_time_delivery"]["sample_size"] == 0
    assert stats["on_time_delivery"]["rate"] is None
    assert stats["fill_rate"]["rate"] is None
    assert set(stats["unavailable"]) == {"lead_time_std_dev", "on_time_rate", "fill_rate"}


def _db_ready() -> bool:
    try:
        with engine.connect() as conn:
            return conn.execute(text("SELECT EXISTS (SELECT 1 FROM purchase_orders)")).scalar()
    except OperationalError:
        return False


db = pytest.mark.skipif(not _db_ready(), reason="needs PostgreSQL with purchase orders imported")


@db
def test_endpoint_matches_direct_sql():
    with engine.connect() as conn:
        supplier_id = conn.execute(text("SELECT min(supplier_id) FROM purchase_orders")).scalar()
        expected = conn.execute(text("""
            SELECT count(*) AS n, avg(receipt_date - order_date) AS mean,
                   percentile_cont(0.5) WITHIN GROUP (ORDER BY receipt_date - order_date) AS median,
                   stddev_samp(receipt_date - order_date) AS sd,
                   avg((receipt_date <= expected_delivery_date)::int) AS on_time,
                   sum(least(accepted_quantity, ordered_quantity))::float / sum(ordered_quantity) AS fill
            FROM purchase_orders
            WHERE supplier_id = :id AND status = 'Received' AND receipt_date IS NOT NULL AND NOT is_emergency
        """), {"id": supplier_id}).mappings().one()
    with TestClient(app) as client:
        body = client.get(f"/suppliers/{supplier_id}/performance").json()
    assert body["order_counts"]["completed"] == expected["n"]
    assert body["lead_time"]["mean_days"] == round(float(expected["mean"]), 2)
    assert body["lead_time"]["median_days"] == round(float(expected["median"]), 2)
    assert body["lead_time"]["std_dev_days"] == round(float(expected["sd"]), 2)
    assert body["on_time_delivery"]["rate"] == round(float(expected["on_time"]), 4)
    assert body["fill_rate"]["rate"] == round(float(expected["fill"]), 4)


@db
def test_unknown_supplier_is_404():
    with TestClient(app) as client:
        response = client.get("/suppliers/SUP-DOES-NOT-EXIST/performance")
    assert response.status_code == 404
