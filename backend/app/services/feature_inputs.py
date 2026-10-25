"""Runtime inputs for app/ml/features.py, read from PostgreSQL.

No feature engineering here: each query returns a DataFrame with exactly the columns features.py reads, using SQL
aliases to give back the original CSV names. Every query takes an `as_of` date and never returns rows dated after it.
"""

import datetime
import pandas as pd
from sqlalchemy import text
from sqlalchemy.engine import Connection


def prediction_date_for(data_cutoff_date: datetime.date) -> datetime.date:
    """The as-of date of a prediction run (CLAUDE.md rule 5): the data cutoff itself when it is a Sunday (the end of a
    complete week, so the forecast starts the next Monday), otherwise the latest Monday on or before the cutoff."""
    if data_cutoff_date.weekday() == 6:
        return data_cutoff_date
    return data_cutoff_date - datetime.timedelta(days=data_cutoff_date.weekday())


def _read(conn: Connection, sql: str, **params) -> pd.DataFrame:
    return pd.read_sql(text(sql), conn, params=params)


def demand_history(conn: Connection, as_of: datetime.date) -> pd.DataFrame:
    """Input of build_weekly_demand."""
    return _read(conn, """
        SELECT demand_date AS "Demand_Date", store_id AS "Store_ID", item_id AS "Item_ID",
               demand_quantity AS "Demand_Quantity"
        FROM demand
        WHERE demand_date <= :as_of
    """, as_of=as_of)


def inventory_history(conn: Connection, as_of: datetime.date) -> pd.DataFrame:
    """`inventory` input of build_stockout_snapshots (daily_inventory.csv names; is_stockout back to 0/1)."""
    return _read(conn, """
        SELECT date, store_id, item_id, demand_qty, closing_qty, on_order_qty, is_stockout::int AS is_stockout
        FROM daily_inventory
        WHERE date <= :as_of
    """, as_of=as_of)


def transfer_history(conn: Connection, as_of: datetime.date) -> pd.DataFrame:
    """`transfers` input of build_stockout_snapshots."""
    return _read(conn, """
        SELECT transfer_date, to_store_id, item_id, shipped_qty
        FROM stock_transfers
        WHERE transfer_date <= :as_of
    """, as_of=as_of)


def purchase_order_history(conn: Connection, as_of: datetime.date) -> pd.DataFrame:
    """`purchase_orders` input of build_stockout_snapshots / supplier_lead_time_history.

    POs ordered on or before as_of, as they were known on as_of: a receipt after as_of is not known yet, so
    receipt_date and lead_time_days are NULL (the PO counts as open).
    """
    return _read(conn, """
        SELECT purchase_order_id, supplier_id, item_id, order_date, expected_delivery_date,
               CASE WHEN receipt_date <= :as_of THEN receipt_date END AS receipt_date,
               CASE WHEN receipt_date <= :as_of THEN lead_time_days END AS lead_time_days,
               ordered_quantity, is_emergency::int AS is_emergency
        FROM purchase_orders
        WHERE order_date <= :as_of
    """, as_of=as_of)


def supplier_item_list(conn: Connection) -> pd.DataFrame:
    """`supplier_items` input of build_stockout_snapshots (supplier_items.csv names; flag back to Y/N). Master data."""
    return _read(conn, """
        SELECT item_id AS "Item_ID", supplier_id AS "Supplier_ID",
               CASE WHEN preferred_supplier_flag THEN 'Y' ELSE 'N' END AS "Preferred_Supplier_Flag"
        FROM supplier_items
    """)


def load_feature_inputs(conn: Connection, data_cutoff_date: datetime.date) -> dict:
    """All source DataFrames for one prediction run. Rows are limited to the prediction date (rule 6),
    which is on or before the data cutoff."""
    as_of = prediction_date_for(data_cutoff_date)
    return {
        "prediction_date": as_of,
        "demand": demand_history(conn, as_of),
        "inventory": inventory_history(conn, as_of),
        "transfers": transfer_history(conn, as_of),
        "purchase_orders": purchase_order_history(conn, as_of),
        "supplier_items": supplier_item_list(conn),
    }
