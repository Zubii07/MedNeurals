# Phase 9: recommendation formulas and rules on hand-built inputs with known answers (no database).

import datetime
import math

import pandas as pd
import pytest

from app.services import recommendation_rules as rules
from app.services.recommendations import Inputs, build_recommendations

P = datetime.date(2025, 11, 30)
REVIEW, URGENT = 0.0416, 0.2126
ITEM, SUB, SUB2 = "MED-000001", "STR-002", "STR-003"

# Base item: d = 10/day, sd = 2/day, L = 10 days, sL = 2 days, VED E (z 1.65)
#   SS = 1.65 * sqrt(10 * 2^2 + 10^2 * 2^2) = 1.65 * sqrt(440) = 34.61;  ROP = 10 * 10 + SS = 134.61;  S = ROP + 70 = 204.61
SS = 1.65 * math.sqrt(440)
ROP = 100 + SS
S = ROP + 70


def make_inputs(central=500, store_stock=None, probs=None, po=(), weekly_p50=70.0, weekly_spread=2 * 1.28 * 7,
                lead=(10.0, 2.0, 20), ved="E", pack=10, moq=1, in_transit=None, forecast_stores=(SUB,)) -> Inputs:
    """One item; forecasts split evenly over forecast_stores; probs = {store: probability}."""
    probs = {SUB: 0.01} if probs is None else probs
    store_stock = store_stock or {SUB: 100}
    n = len(forecast_stores)
    forecasts = pd.DataFrame([{"store_id": s, "item_id": ITEM, "horizon": h, "p50": weekly_p50 / n,
                               "p90": (weekly_p50 + weekly_spread) / n} for s in forecast_stores for h in (1, 2, 3, 4)])
    stock = pd.DataFrame([{"store_id": "STR-001", "item_id": ITEM, "closing_qty": central}] +
                         [{"store_id": s, "item_id": ITEM, "closing_qty": q} for s, q in store_stock.items()])
    pos = pd.DataFrame(list(po), columns=["purchase_order_id", "item_id", "order_date", "expected_delivery_date",
                                          "receipt_date", "ordered_quantity", "status"])
    return Inputs(
        prediction_date=P, horizon_days=14, threshold_review=REVIEW, threshold_urgent=URGENT,
        items=pd.DataFrame([{"item_id": ITEM, "ved_class": ved, "pack_size": pack, "supplier_id": "SUP-001",
                             "moq_packs": moq, "preferred_count": 1}]),
        forecasts=forecasts,
        stockout=pd.DataFrame([{"store_id": s, "item_id": ITEM, "probability": p} for s, p in probs.items()],
                              columns=["store_id", "item_id", "probability"]),
        lead_times=pd.DataFrame([{"supplier_id": "SUP-001", "lead_time": lead[0], "lead_time_std": lead[1],
                                  "lead_time_sample_size": lead[2]}]),
        stock=stock,
        in_transit=pd.DataFrame([{"store_id": s, "item_id": ITEM, "in_transit_qty": q} for s, q in (in_transit or {}).items()],
                                columns=["store_id", "item_id", "in_transit_qty"]),
        purchase_orders=pos,
    )


def po_line(po_id, qty, ordered="2025-11-20", expected="2025-12-05", received=None, status="Open"):
    return (po_id, ITEM, pd.Timestamp(ordered), pd.Timestamp(expected), pd.Timestamp(received) if received else pd.NaT,
            qty, status)


def build(**kw):
    rows, skipped = build_recommendations(make_inputs(**kw))
    return rows, skipped


# ---------------------------------------------------------------- formulas

def test_formulas_hand_computed():
    assert rules.daily_demand(280, 28) == 10
    assert rules.demand_std(280, 280 + 2 * 1.28 * 28, 28) == pytest.approx(2)
    assert rules.demand_std(300, 280, 28) == 0                                   # P90 below P50 never gives a negative std
    assert rules.safety_stock(1.65, 10, 2, 10, 2) == pytest.approx(SS)
    assert rules.reorder_point(10, 10, SS) == pytest.approx(ROP)
    assert rules.order_up_to_level(ROP, 10) == pytest.approx(S)
    assert rules.inventory_position(120, 300) == 420
    assert rules.Z_BY_VED == {"V": 2.05, "E": 1.65, "D": 1.28}


def test_build_uses_the_formulas():
    (row,), skipped = build(central=500)
    assert skipped == []
    assert row["forecast_p50"] == pytest.approx(10) and row["demand_std"] == pytest.approx(2)
    assert row["z_value"] == 1.65
    assert row["safety_stock"] == pytest.approx(SS)
    assert row["reorder_point"] == pytest.approx(ROP)
    assert row["order_up_to_level"] == pytest.approx(S)


@pytest.mark.parametrize("ved, z", [("V", 2.05), ("E", 1.65), ("D", 1.28)])
def test_safety_stock_z_by_ved(ved, z):
    (row,), _ = build(ved=ved)
    assert row["z_value"] == z
    assert row["safety_stock"] == pytest.approx(z * math.sqrt(440))


# ---------------------------------------------------------------- 1. low stock + high demand + long lead time

def test_low_stock_high_demand_long_lead_time_is_purchase_high():
    # d = 50/day, sd = 2, L = 20, sL = 2: SS = 1.65*sqrt(20*4 + 2500*4) = 165.67, ROP = 1165.67, S = 1515.67
    (row,), _ = build(central=40, weekly_p50=350, lead=(20.0, 2.0, 20), probs={SUB: 0.35})
    ss = 1.65 * math.sqrt(20 * 4 + 2500 * 4)
    target = 50 * 20 + ss + 350
    assert row["action"] == "PURCHASE" and row["priority"] == "HIGH"
    assert row["inventory_position"] == 40
    assert row["recommended_quantity"] == math.ceil((target - 40) / 10) * 10 == 1480
    assert "below the reorder point" in row["reason"] and "1,480 units" in row["reason"]


# ---------------------------------------------------------------- 2. sufficient stock

def test_sufficient_stock_gives_none_low():
    (row,), _ = build(central=1000, probs={SUB: 0.01})
    assert row["action"] == "NONE" and row["priority"] == "LOW"
    assert row["recommended_quantity"] == row["transfer_qty"] == 0
    assert "covers the order-up-to level" in row["reason"]


# ---------------------------------------------------------------- 3. open PO already covers the need

def test_open_po_covering_the_need_prevents_a_purchase():
    (without_po,), _ = build(central=50)
    assert without_po["action"] == "PURCHASE"

    (row,), _ = build(central=50, po=[po_line("PO-1", 300)])
    assert row["inventory_position"] == 350 and row["on_order_qty"] == 300 and row["open_po_count"] == 1
    assert row["action"] == "NONE" and row["recommended_quantity"] == 0


def test_open_po_partly_covering_reduces_the_quantity():
    (row,), _ = build(central=50, po=[po_line("PO-1", 100)])
    assert row["inventory_position"] == 150
    assert row["recommended_quantity"] == math.ceil((S - 150) / 10) * 10 == 60


# ---------------------------------------------------------------- 4. transfer / expedite

def test_transfer_from_central_is_preferred_over_purchase():
    # IP 500 >= S, but the sub-store is at risk: P90 over 14 days = 2 * (70 + 17.92) = 175.84, stock 20 + 10 in transit
    rows, _ = build(central=500, store_stock={SUB: 20}, in_transit={SUB: 10}, probs={SUB: 0.30})
    (row,) = rows
    assert row["action"] == "TRANSFER" and row["store_id"] == SUB and row["priority"] == "HIGH"
    assert row["transfer_qty"] == math.ceil(2 * (70 + 2 * 1.28 * 7) - 30) == 146
    assert row["recommended_quantity"] == 0
    assert row["stockout_probability"] == 0.30


def test_transfer_allocation_never_exceeds_central_stock_and_serves_highest_risk_first():
    # IP = 50 + 400 on order >= S, but central on hand (50) is less than the two stores' needs (~88 each)
    rows, _ = build(central=50, po=[po_line("PO-1", 400)], forecast_stores=(SUB, SUB2),
                    store_stock={SUB: 0, SUB2: 0}, probs={SUB: 0.10, SUB2: 0.50})
    (row,) = rows                                       # the lower-risk store gets nothing left
    assert row["store_id"] == SUB2 and row["transfer_qty"] == 50
    assert row["priority"] == "HIGH"
    assert "covers only 50" in row["reason"] and "PO-1" in row["reason"]
    assert rules.allocate_transfers(50, [88, 88]) == [50, 0]
    assert rules.allocate_transfers(500, [88, 30]) == [88, 30]


def test_empty_central_store_with_open_po_is_expedite():
    rows, _ = build(central=0, store_stock={SUB: 5}, probs={SUB: 0.60},
                    po=[po_line("PO-LATE", 300, expected="2025-12-09"), po_line("PO-SOON", 200, expected="2025-12-03")])
    (row,) = rows
    assert row["action"] == "EXPEDITE_PO" and row["priority"] == "HIGH"
    assert row["purchase_order_id"] == "PO-SOON"        # the open PO expected first
    assert row["inventory_position"] == 500 and row["recommended_quantity"] == 0
    assert "in 3 days" in row["reason"]


def test_no_transfer_or_expedite_without_supporting_data():
    # at risk, IP >= S, but the sub-store already holds its P90 need: nothing to move, no PO to expedite
    (row,), _ = build(central=500, store_stock={SUB: 1000}, probs={SUB: 0.30})
    assert row["action"] == "NONE"
    assert rules.decide_action(ip=500, target=S, probability=0.3, threshold_review=REVIEW,
                               central_on_hand=0, open_po_count=0, transfer_need=50) == "NONE"


# ---------------------------------------------------------------- 5. never negative

def test_quantities_are_never_negative():
    assert rules.purchase_quantity(target=100, ip=1000, pack_size=10, moq_packs=5) == (0, 0, False)
    assert rules.store_transfer_need(p90_horizon=10, on_hand=500, in_transit=20) == 0
    assert rules.allocate_transfers(-5, [10, -3]) == [0, 0]
    rows, _ = build(central=100000, store_stock={SUB: 100000}, probs={SUB: 0.9})
    assert all(r["recommended_quantity"] >= 0 and r["transfer_qty"] >= 0 for r in rows)


# ---------------------------------------------------------------- 6. incoming stock counted once

def test_open_purchase_orders_filter():
    po = pd.DataFrame([po_line(*args) for args in [
        ("OPEN", 100),                                                   # open, no receipt yet
        ("RECEIVED-BEFORE", 200, "2025-11-01", "2025-11-12", "2025-11-12", "Received"),   # already in on-hand
        ("RECEIVED-AFTER", 300, "2025-11-25", "2025-12-04", "2025-12-04", "Received"),    # still incoming on P
        ("CANCELLED", 400, "2025-11-20", "2025-12-01", None, "Cancelled"),
        ("ORDERED-LATER", 500, "2025-12-01", "2025-12-10", None, "Open"),               # not known on P
    ]], columns=["purchase_order_id", "item_id", "order_date", "expected_delivery_date", "receipt_date",
                 "ordered_quantity", "status"])
    assert sorted(rules.open_purchase_orders(po, P)["purchase_order_id"]) == ["OPEN", "RECEIVED-AFTER"]

    (row,), _ = build_recommendations(Inputs(**{**make_inputs(central=60).__dict__, "purchase_orders": po}))
    assert row["on_order_qty"] == 400 and row["open_po_count"] == 2
    assert row["inventory_position"] == 60 + 400          # received-before is already in the 60 on hand


# ---------------------------------------------------------------- 7. / 8. missing inputs

def test_missing_forecast_or_stockout_prediction_is_skipped():
    inputs = make_inputs()
    rows, skipped = build_recommendations(Inputs(**{**inputs.__dict__, "forecasts": inputs.forecasts.assign(item_id="OTHER")}))
    assert rows == [] and skipped == [{"item_id": ITEM, "reason": "no demand forecast for this item in the forecast run"}]

    rows, skipped = build(probs={})
    assert rows == [] and "no stockout prediction" in skipped[0]["reason"]


@pytest.mark.parametrize("lead, message", [
    ((None, None, 0), "no completed routine orders"),
    ((12.0, None, 1), "fewer than 2 completed routine orders"),
])
def test_missing_lead_time_or_variability_is_skipped(lead, message):
    rows, skipped = build(lead=lead)
    assert rows == [] and message in skipped[0]["reason"]


def test_missing_supplier_central_snapshot_or_ved_is_skipped():
    inputs = make_inputs()
    no_supplier = inputs.items.assign(supplier_id=None, preferred_count=0)
    assert "0 preferred suppliers" in build_recommendations(Inputs(**{**inputs.__dict__, "items": no_supplier}))[1][0]["reason"]
    no_central = inputs.stock[inputs.stock["store_id"] != "STR-001"]
    assert "no central-store inventory" in build_recommendations(Inputs(**{**inputs.__dict__, "stock": no_central}))[1][0]["reason"]
    assert "unknown VED" in build(ved="X")[1][0]["reason"]


def test_zero_demand_variability_is_not_missing():
    (row,), skipped = build(weekly_spread=0)               # P90 == P50: sd = 0, SS only from lead-time variability
    assert skipped == [] and row["demand_std"] == 0
    assert row["safety_stock"] == pytest.approx(1.65 * math.sqrt(100 * 4))


# ---------------------------------------------------------------- 9. MOQ and pack size

def test_pack_size_and_moq_rounding():
    assert rules.purchase_quantity(target=205, ip=100, pack_size=10, moq_packs=None) == (110, 11, False)
    assert rules.purchase_quantity(target=205, ip=100, pack_size=10, moq_packs=20) == (200, 20, True)
    assert rules.purchase_quantity(target=205, ip=100, pack_size=None, moq_packs=None) == (105, 105, False)
    assert rules.purchase_quantity(target=205, ip=100, pack_size=0, moq_packs=0) == (105, 105, False)
    (row,), _ = build(central=50, pack=25, moq=10)          # need 154.61 -> 7 packs, MOQ 10 packs -> 250 units
    assert row["recommended_quantity"] == 250 and "supplier minimum 10 packs" in row["reason"]


# ---------------------------------------------------------------- priority

@pytest.mark.parametrize("prob, ved, ip, expected", [
    (0.30, "D", 1000, "HIGH"),        # urgent risk
    (0.01, "V", 100, "HIGH"),         # vital item below its reorder point
    (0.01, "E", 100, "MODERATE"),     # below reorder point
    (0.05, "E", 1000, "MODERATE"),    # review risk
    (0.01, "V", 1000, "LOW"),
])
def test_priority_rules(prob, ved, ip, expected):
    assert rules.priority(prob, REVIEW, URGENT, ved, ip, ROP) == expected


def test_item_with_incomplete_forecast_horizons_is_skipped():
    inputs = make_inputs()
    other = inputs.forecasts.assign(item_id="MED-000002")            # a second item with all 4 horizons
    partial = inputs.forecasts[inputs.forecasts["horizon"] <= 2]     # this item: only 2 of 4
    rows, skipped = build_recommendations(Inputs(**{**inputs.__dict__, "forecasts": pd.concat([partial, other])}))
    assert rows == []
    assert skipped == [{"item_id": ITEM, "reason": "forecast is missing horizon(s) [3, 4] of [1, 2, 3, 4]; "
                                                   "daily demand needs all four"}]


def test_missing_horizons_cannot_underestimate_daily_demand():
    # Regression: with horizons 3-4 missing, sum P50 / 28 would give 140 / 28 = 5/day instead of the true 10/day.
    # This also holds when every item of the run lacks the same horizons (the divisor is fixed at 28, not inferred).
    inputs = make_inputs()
    partial = inputs.forecasts[inputs.forecasts["horizon"] <= 2]
    assert partial["p50"].sum() / 28 == 5
    rows, skipped = build_recommendations(Inputs(**{**inputs.__dict__, "forecasts": partial}))
    assert rows == [] and "missing horizon(s) [3, 4]" in skipped[0]["reason"]

    (complete,), _ = build_recommendations(inputs)
    assert complete["forecast_p50"] == pytest.approx(10)


def test_single_unit_transfer_wording():
    rows, _ = build(central=1, po=[po_line("PO-1", 400)], store_stock={SUB: 0}, probs={SUB: 0.30})
    assert rows[0]["transfer_qty"] == 1 and "Transfer 1 unit from" in rows[0]["reason"]


def test_preferred_supplier_count_is_reported_as_an_integer():
    inputs = make_inputs()
    items = inputs.items.assign(supplier_id=None, preferred_count=0.0)   # float after a pandas fillna (CSV path)
    _, skipped = build_recommendations(Inputs(**{**inputs.__dict__, "items": items}))
    assert skipped[0]["reason"].startswith("0 preferred suppliers")
