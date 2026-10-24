import numpy as np
import pandas as pd

CENTRAL_STORE = "STR-001"

DEMAND_FEATURES = ["lag_1", "lag_2", "lag_4", "lag_52", "roll_mean_4", "roll_mean_12", "roll_std_12",
                   "roll_mean_52", "trend_4_12", "week_of_year", "horizon"]

# supplier_lt_mean and days_since_stockout are computed (useful for rules/explanations) but NOT model features:
# they encode elapsed time and add < 0.005 PR-AUC.
STOCKOUT_FEATURES = ["stock_on_hand", "in_transit_qty", "adu_7", "adu_28", "demand_std_28", "demand_trend",
                     "days_of_cover", "cover_incl_transit", "stockout_days_last_28",
                     "central_stock_qty", "central_cover_hosp", "central_on_order_qty", "incoming_within_n",
                     "fc_next_n_p50", "fc_next_n_p90", "cover_vs_forecast", "week_of_year"]
STOCKOUT_EXTRA = ["supplier_lt_mean", "days_since_stockout"]


def build_weekly_demand(demand):
    """demand: Demand_Date, Store_ID, Item_ID, Demand_Quantity. Returns complete store x item x Monday-week grid."""
    d = demand[["Demand_Date", "Store_ID", "Item_ID", "Demand_Quantity"]].copy()
    d["Demand_Date"] = pd.to_datetime(d["Demand_Date"])
    for c in ("Store_ID", "Item_ID"):
        d[c] = d[c].astype(str)
    d["week_start"] = d["Demand_Date"] - pd.to_timedelta(d["Demand_Date"].dt.dayofweek, unit="D")
    weekly = d.groupby(["Store_ID", "Item_ID", "week_start"])["Demand_Quantity"].sum().rename("demand_qty").reset_index()
    first_full = d["Demand_Date"].min() + pd.Timedelta(days=(7 - d["Demand_Date"].min().dayofweek) % 7)
    last_full = d["Demand_Date"].max() - pd.Timedelta(days=6)
    weeks = pd.DataFrame({"week_start": pd.date_range(first_full, last_full, freq="W-MON")})
    grid = weekly[["Store_ID", "Item_ID"]].drop_duplicates().merge(weeks, how="cross")
    out = grid.merge(weekly, on=["Store_ID", "Item_ID", "week_start"], how="left").fillna({"demand_qty": 0.0})
    return out.sort_values(["Store_ID", "Item_ID", "week_start"]).reset_index(drop=True)


def demand_features(weekly, horizons=(1, 2, 3, 4), with_target=True):
    """One row per (store, item, week, horizon). Target for horizon h = demand in week t+h. Features use weeks <= t."""
    w = weekly.sort_values(["Store_ID", "Item_ID", "week_start"]).copy()
    g = w.groupby(["Store_ID", "Item_ID"])["demand_qty"]
    for k in (1, 2, 4, 52):
        w[f"lag_{k}"] = g.shift(k - 1)                       # lag_1 = the week just completed
    w["roll_mean_4"] = g.transform(lambda x: x.rolling(4).mean())
    w["roll_mean_12"] = g.transform(lambda x: x.rolling(12).mean())
    w["roll_std_12"] = g.transform(lambda x: x.rolling(12).std())
    w["roll_mean_52"] = g.transform(lambda x: x.rolling(52, min_periods=26).mean())
    w["trend_4_12"] = w["roll_mean_4"] / w["roll_mean_12"].replace(0, np.nan)
    w["week_of_year"] = w["week_start"].dt.isocalendar().week.astype(int)
    rows = []
    for h in horizons:
        r = w.copy()
        r["horizon"] = h
        r["target_week"] = r["week_start"] + pd.Timedelta(weeks=h)
        if with_target:
            r["target"] = g.shift(-h).values
        rows.append(r)
    return pd.concat(rows, ignore_index=True).dropna(subset=["roll_mean_12"])


def forecast(artifact, weekly, as_of=None, all_weeks=False):
    """P50/P90 forecasts. as_of=None -> from the latest complete week. all_weeks=True -> from every week (for stockout features)."""
    f = demand_features(weekly, horizons=artifact["horizons"], with_target=False)
    if not all_weeks:
        f = f[f["week_start"] == (pd.Timestamp(as_of) if as_of is not None else f["week_start"].max())]
    X = f[artifact["feature_columns"]]
    out = f[["Store_ID", "Item_ID", "week_start", "horizon", "target_week"]].copy()
    out["p50"] = np.clip(artifact["model_p50"].predict(X), 0, None)
    out["p90"] = np.maximum(np.clip(artifact["model_p90"].predict(X), 0, None), out["p50"])
    return out.reset_index(drop=True)


# stockout
def supplier_lead_time_history(purchase_orders):
    """Expanding mean lead time per supplier, known at each receipt date (routine POs only)."""
    po = purchase_orders.copy()
    po["receipt_date"] = pd.to_datetime(po["receipt_date"])
    rec = po[(po["is_emergency"] == 0) & po["receipt_date"].notna()].sort_values(["receipt_date", "purchase_order_id"], kind="mergesort")
    rec["supplier_lt_mean"] = rec.groupby("supplier_id")["lead_time_days"].transform(lambda x: x.expanding().mean())
    return rec.drop_duplicates(["receipt_date", "supplier_id"], keep="last")[["receipt_date", "supplier_id", "supplier_lt_mean"]]


def build_stockout_snapshots(inventory, transfers, purchase_orders, supplier_items, n_days=14,
                             forecasts=None, snapshot_weekday=0, with_label=True):
    """One row per sub-store item per snapshot date (end of day). forecasts = output of forecast(..., all_weeks=True)."""
    inv = inventory.copy()
    inv["date"] = pd.to_datetime(inv["date"])
    for c in ("store_id", "item_id"):
        inv[c] = inv[c].astype(str)
    inv = inv.sort_values(["store_id", "item_id", "date"])
    sub = inv[inv["store_id"] != CENTRAL_STORE].copy()
    g = sub.groupby(["store_id", "item_id"])
    sub["adu_7"] = g["demand_qty"].transform(lambda x: x.rolling(7, min_periods=1).mean())
    sub["adu_28"] = g["demand_qty"].transform(lambda x: x.rolling(28, min_periods=7).mean())
    sub["demand_std_28"] = g["demand_qty"].transform(lambda x: x.rolling(28, min_periods=7).std())
    sub["demand_trend"] = sub["adu_7"] / sub["adu_28"].replace(0, np.nan)
    sub["stockout_days_last_28"] = g["is_stockout"].transform(lambda x: x.rolling(28, min_periods=1).sum())
    last_so = sub["date"].where(sub["is_stockout"] == 1).groupby([sub["store_id"], sub["item_id"]]).ffill()
    sub["days_since_stockout"] = (sub["date"] - last_so).dt.days
    if with_label:  # any stockout day in t+1 .. t+n_days
        sub["label"] = g["is_stockout"].transform(lambda x: x[::-1].rolling(n_days, min_periods=1).max()[::-1].shift(-1))
    snap = sub[sub["date"].dt.dayofweek == snapshot_weekday].rename(columns={"closing_qty": "stock_on_hand"})

    tr = transfers.copy()
    tr["transfer_date"] = pd.to_datetime(tr["transfer_date"])
    for c in ("to_store_id", "item_id"):
        tr[c] = tr[c].astype(str)
    in_transit = (tr.groupby(["transfer_date", "to_store_id", "item_id"])["shipped_qty"].sum().rename("in_transit_qty")
                    .reset_index().rename(columns={"transfer_date": "date", "to_store_id": "store_id"}))
    snap = snap.merge(in_transit, on=["date", "store_id", "item_id"], how="left").fillna({"in_transit_qty": 0})
    snap["days_of_cover"] = np.where(snap["adu_28"] > 0, snap["stock_on_hand"] / snap["adu_28"], 999.0)
    snap["cover_incl_transit"] = np.where(snap["adu_28"] > 0, (snap["stock_on_hand"] + snap["in_transit_qty"]) / snap["adu_28"], 999.0)

    central = (inv[inv["store_id"] == CENTRAL_STORE][["date", "item_id", "closing_qty", "on_order_qty"]]
                 .rename(columns={"closing_qty": "central_stock_qty", "on_order_qty": "central_on_order_qty"}))
    snap = snap.merge(central, on=["date", "item_id"], how="left")
    hospital_adu = snap.groupby(["date", "item_id"])["adu_28"].transform("sum")
    snap["central_cover_hosp"] = np.where(hospital_adu > 0, snap["central_stock_qty"] / hospital_adu, 999.0)

    po = purchase_orders.copy()
    for c in ("order_date", "expected_delivery_date", "receipt_date"):
        po[c] = pd.to_datetime(po[c])
    incoming = []
    for d in np.sort(snap["date"].unique()):
        d = pd.Timestamp(d)
        open_po = po[(po["order_date"] <= d) & (po["receipt_date"].isna() | (po["receipt_date"] > d))
                     & (po["expected_delivery_date"] <= d + pd.Timedelta(days=n_days))]
        if len(open_po):
            s = open_po.groupby("item_id")["ordered_quantity"].sum().rename("incoming_within_n").reset_index()
            s["date"] = d
            incoming.append(s)
    incoming = pd.concat(incoming) if incoming else pd.DataFrame(columns=["item_id", "incoming_within_n", "date"])
    snap = snap.merge(incoming, on=["date", "item_id"], how="left").fillna({"incoming_within_n": 0})

    preferred = supplier_items[supplier_items["Preferred_Supplier_Flag"] == "Y"].set_index("Item_ID")["Supplier_ID"]
    snap["supplier_id"] = snap["item_id"].map(preferred)
    lt_hist = supplier_lead_time_history(po).rename(columns={"receipt_date": "date"})
    snap = pd.merge_asof(snap.sort_values("date"), lt_hist.sort_values("date"), on="date", by="supplier_id", direction="backward")
    expected_lt = po.assign(e=(po["expected_delivery_date"] - po["order_date"]).dt.days).groupby("supplier_id")["e"].median()
    snap["supplier_lt_mean"] = snap["supplier_lt_mean"].fillna(snap["supplier_id"].map(expected_lt))

    if forecasts is not None:
        n_weeks = int(np.ceil(n_days / 7))
        fc = (forecasts[forecasts["horizon"] <= n_weeks].groupby(["Store_ID", "Item_ID", "week_start"])[["p50", "p90"]].sum().reset_index()
                .rename(columns={"Store_ID": "store_id", "Item_ID": "item_id", "p50": "fc_next_n_p50", "p90": "fc_next_n_p90"}))
        fc["date"] = fc["week_start"] + pd.Timedelta(days=6)      # forecast made after week w is usable from that Sunday
        fc = fc.drop(columns="week_start")
        snap = pd.merge_asof(snap.sort_values("date"), fc.sort_values("date"), on="date", by=["store_id", "item_id"],
                             direction="backward", tolerance=pd.Timedelta(days=7))
    else:
        snap["fc_next_n_p50"] = snap["adu_28"] * n_days
        snap["fc_next_n_p90"] = np.nan
    snap["cover_vs_forecast"] = (snap["stock_on_hand"] + snap["in_transit_qty"]) / snap["fc_next_n_p50"].replace(0, np.nan)
    snap["week_of_year"] = snap["date"].dt.isocalendar().week.astype(int)
    cols = ["date", "store_id", "item_id", "supplier_id"] + STOCKOUT_FEATURES + STOCKOUT_EXTRA + (["label"] if with_label else [])
    snap = snap[cols].replace([np.inf, -np.inf], np.nan)
    snap[STOCKOUT_FEATURES] = snap[STOCKOUT_FEATURES].clip(upper=1e6)
    return snap.sort_values(["date", "store_id", "item_id"]).reset_index(drop=True)


def _logit(p):
    p = np.clip(np.asarray(p, dtype=float), 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p)).reshape(-1, 1)


def stockout_probability(artifact, snapshots):
    """Calibrated probability of a stockout within artifact['n_days']."""
    raw = artifact["model"].predict_proba(snapshots[artifact["feature_columns"]])[:, 1]
    cal = artifact.get("calibrator")
    return cal.predict_proba(_logit(raw))[:, 1] if cal is not None else raw
