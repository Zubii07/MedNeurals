"""Procurement recommendation formulas and rules. Deterministic, no ML, no database.

Units: quantities are in the item's UOM (the unit of demand, stock and ordered_quantity); time is in days.
- Daily demand d       = sum of sub-store forecast P50 over horizons 1-4 / 28
- Demand std sd        = max(0, (sum P90 - sum P50) / (1.28 * 28))   (P90 = P50 + 1.28 sd)
- Safety stock SS      = z * sqrt(L * sd^2 + d^2 * sL^2), z by VED class (BACKEND_PLAN Phase 9: V 2.05 / E 1.65 / D 1.28)
- Reorder point ROP    = d * L + SS
- Order-up-to level S  = ROP + d * REVIEW_PERIOD_DAYS (recommendations are refreshed weekly)
- Inventory position   = central on-hand + open purchase-order quantity (receipts are already in on-hand)
- Purchase quantity    = 0 if IP >= S, else max(ceil((S - IP) / pack), MOQ packs) * pack
- Transfer need        = P90 demand over the stockout horizon (H1 + H2) - store on-hand - stock in transit, for each
                         sub-store at risk (probability >= review threshold); central on-hand is served highest risk first

Decision (one item-level row, plus one TRANSFER row per at-risk sub-store that receives stock):
  IP < S                                                  -> PURCHASE      + TRANSFER rows from central stock
  IP >= S, at-risk need > central on-hand, a PO is open   -> EXPEDITE_PO   + TRANSFER rows of what central has
  IP >= S, at-risk need covered by central on-hand        -> (no item row) + TRANSFER rows
  otherwise                                               -> NONE
Priority: HIGH if probability >= urgent threshold or (VED V and IP < ROP); MODERATE if probability >= review threshold or
IP < ROP; else LOW. Item rows use the highest sub-store probability, TRANSFER rows their store's probability.

The plan fixes z and the inputs. The weekly review period, the purchase trigger and the priority rule were taken from the
notebook output app/ml/trained/reorder_recommendations_latest.csv (docs/CSV_COLUMN_MAPPING.md, Phase 9).
"""

import math

import pandas as pd

from app.models.recommendations import (
    ACTION_EXPEDITE,
    ACTION_NONE,
    ACTION_PURCHASE,
    PRIORITY_HIGH,
    PRIORITY_LOW,
    PRIORITY_MODERATE,
)

Z_BY_VED = {"V": 2.05, "E": 1.65, "D": 1.28}
P90_Z = 1.28
REVIEW_PERIOD_DAYS = 7
FORECAST_HORIZONS = (1, 2, 3, 4)          # weeks; d and sd divide by 7 * 4 = 28 days


def daily_demand(sum_p50: float, n_days: int) -> float:
    return sum_p50 / n_days


def demand_std(sum_p50: float, sum_p90: float, n_days: int) -> float:
    return max(0.0, (sum_p90 - sum_p50) / (P90_Z * n_days))


def safety_stock(z: float, d: float, sd: float, lead_time: float, lead_time_std: float) -> float:
    return z * math.sqrt(lead_time * sd ** 2 + d ** 2 * lead_time_std ** 2)


def reorder_point(d: float, lead_time: float, ss: float) -> float:
    return d * lead_time + ss


def order_up_to_level(rop: float, d: float, review_days: int = REVIEW_PERIOD_DAYS) -> float:
    return rop + d * review_days


def inventory_position(on_hand: int, on_order: int) -> int:
    return on_hand + on_order


def purchase_quantity(target: float, ip: float, pack_size: int, moq_packs: int | None) -> tuple[int, int, bool]:
    """(units, packs, moq_applied): whole packs, at least the MOQ (in packs) when there is one. Never negative."""
    if pack_size < 1:
        raise ValueError(f"invalid pack size {pack_size}")
    if ip >= target:
        return 0, 0, False
    packs = math.ceil((target - ip) / pack_size)
    moq = moq_packs if moq_packs and moq_packs > 0 else 0
    return max(packs, moq) * pack_size, max(packs, moq), moq > packs


def open_purchase_orders(po: pd.DataFrame, as_of) -> pd.DataFrame:
    as_of = pd.Timestamp(as_of)
    order_date = pd.to_datetime(po["order_date"])
    receipt = pd.to_datetime(po["receipt_date"])
    cancelled = po["status"].fillna("").str.strip().str.lower().str.startswith("cancel")
    return po[(order_date <= as_of) & (receipt.isna() | (receipt > as_of)) & ~cancelled]


def store_transfer_need(p90_horizon: float, on_hand: int, in_transit: int) -> int:
    """Units a sub-store needs to cover the P90 forecast of the stockout horizon. Never negative."""
    return max(0, math.ceil(p90_horizon - on_hand - in_transit))


def allocate_transfers(central_on_hand: int, needs: list[int]) -> list[int]:
    """Give central stock to the needs in the given order (highest risk first); never more than is available."""
    left = max(0, central_on_hand)
    out = []
    for need in needs:
        qty = min(max(0, need), left)
        out.append(qty)
        left -= qty
    return out


def item_action(ip: float, target: float, at_risk_need: int, central_on_hand: int, open_po_count: int,
                has_transfers: bool) -> str | None:
    """Item-level action; None = no item row (the TRANSFER rows are the whole recommendation)."""
    if ip < target:
        return ACTION_PURCHASE
    if at_risk_need > central_on_hand and open_po_count > 0:
        return ACTION_EXPEDITE
    if has_transfers:
        return None
    return ACTION_NONE


def priority(probability: float, threshold_review: float, threshold_urgent: float, ved_class: str,
             ip: float, rop: float) -> str:
    if probability >= threshold_urgent or (ved_class == "V" and ip < rop):
        return PRIORITY_HIGH
    if probability >= threshold_review or ip < rop:
        return PRIORITY_MODERATE
    return PRIORITY_LOW
