"""Supplier performance statistics using plain formulas over purchase_orders.

Completed orders are Received orders with a receipt_date <= as_of. Open, cancelled,
other-status, and missing-receipt orders are excluded. Emergency orders are excluded
unless include_emergency is enabled.

Metrics for completed orders:
- Lead time = receipt_date - order_date; mean, median, sample standard deviation,
  minimum, and maximum.
- On-time rate = orders with receipt_date <= expected_delivery_date / orders with both dates.
- Fill rate = sum(min(accepted_quantity, ordered_quantity)) / sum(ordered_quantity).

Unavailable metrics return None and are listed in unavailable.
"""
import datetime

import pandas as pd
from sqlalchemy import Connection, text

ORDER_COLUMNS = ["purchase_order_id", "order_date", "expected_delivery_date", "receipt_date",
                 "ordered_quantity", "accepted_quantity", "is_emergency", "status"]


def supplier_orders(conn: Connection, supplier_id: str, as_of: datetime.date | None = None) -> pd.DataFrame:
    """The supplier's purchase order lines, ordered on or before as_of (all of them when as_of is None)."""
    return pd.read_sql(text(f"""
        SELECT {", ".join(ORDER_COLUMNS)}
        FROM purchase_orders
        WHERE supplier_id = :supplier_id AND (CAST(:as_of AS date) IS NULL OR order_date <= :as_of)
        ORDER BY order_date, purchase_order_id
    """), conn, params={"supplier_id": supplier_id, "as_of": as_of})


def _round(value, digits: int):
    return None if value is None or pd.isna(value) else round(float(value), digits)


def _date(value) -> datetime.date | None:
    return None if pd.isna(value) else value.date()


def compute_performance(orders: pd.DataFrame, as_of: datetime.date | None = None,
                        include_emergency: bool = False) -> dict:
    """Performance metrics of one supplier's orders (columns ORDER_COLUMNS). Deterministic; see the module docstring."""
    po = orders.astype({"is_emergency": bool})
    for c in ("order_date", "expected_delivery_date", "receipt_date"):
        po[c] = pd.to_datetime(po[c])
    if not include_emergency:
        po = po[~po["is_emergency"]]
    status = po["status"].fillna("").str.strip().str.lower()
    receipt = po["receipt_date"]
    if as_of is not None:
        receipt = receipt.where(receipt <= pd.Timestamp(as_of))
    received = status == "received"
    cancelled = status.str.startswith("cancel")
    open_ = (status == "open") | (received & po["receipt_date"].notna() & receipt.isna())
    missing_receipt = received & po["receipt_date"].isna()
    completed_mask = received & receipt.notna()
    done = po[completed_mask].assign(receipt_date=receipt[completed_mask])

    lead = (done["receipt_date"] - done["order_date"]).dt.days
    timed = done.dropna(subset=["expected_delivery_date"])
    delayed = int((timed["receipt_date"] > timed["expected_delivery_date"]).sum())
    ordered = int(done["ordered_quantity"].sum())
    accepted = int(done[["accepted_quantity", "ordered_quantity"]].min(axis=1).sum())

    unavailable = {}
    if len(lead) == 0:
        unavailable["lead_time"] = "no completed orders with an order date and a receipt date"
    elif len(lead) < 2:
        unavailable["lead_time_std_dev"] = "needs at least 2 completed orders"
    if len(timed) == 0:
        unavailable["on_time_rate"] = "no completed orders with both an expected and an actual delivery date"
    if ordered == 0:
        unavailable["fill_rate"] = "no ordered quantity on completed orders"

    return {
        "as_of": as_of,
        "include_emergency": include_emergency,
        "data_period": {
            "first_order_date": _date(po["order_date"].min()),
            "last_order_date": _date(po["order_date"].max()),
            "last_receipt_date": _date(done["receipt_date"].max()),
        },
        "order_counts": {
            "total": len(orders),
            "emergency_excluded": len(orders) - len(po),
            "completed": len(done),
            "open": int(open_.sum()),
            "cancelled": int(cancelled.sum()),
            "missing_receipt_date": int(missing_receipt.sum()),
            "other_status": int((~(received | cancelled | open_)).sum()),
        },
        "lead_time": {
            "sample_size": len(lead),
            "mean_days": _round(lead.mean(), 2) if len(lead) else None,
            "median_days": _round(lead.median(), 2) if len(lead) else None,
            "std_dev_days": _round(lead.std(ddof=1), 2) if len(lead) >= 2 else None,
            "min_days": int(lead.min()) if len(lead) else None,
            "max_days": int(lead.max()) if len(lead) else None,
        },
        "on_time_delivery": {
            "sample_size": len(timed),
            "on_time_count": len(timed) - delayed,
            "delayed_count": delayed,
            "rate": _round((len(timed) - delayed) / len(timed), 4) if len(timed) else None,
        },
        "fill_rate": {
            "sample_size": len(done),
            "ordered_quantity": ordered,
            "accepted_quantity": accepted,
            "partially_filled_count": int((done["accepted_quantity"] < done["ordered_quantity"]).sum()),
            "rate": _round(accepted / ordered, 4) if ordered else None,
        },
        "unavailable": unavailable,
    }
