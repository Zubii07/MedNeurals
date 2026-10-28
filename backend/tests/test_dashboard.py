# Phase 10: read-only dashboard endpoints against the real PostgreSQL DB. Tests insert their own run pairs (newest, so
# they become the latest run) with the Phase 9 helper and delete only what they created.

import pytest
from sqlalchemy import text

import app.api.dashboard as dashboard_api
import app.services.model_runs as model_runs
import app.services.predictions as predictions_service
import app.services.recommendations as recommendations_service
from app.database.connection import engine
from tests.test_recommendations import ITEMS, SUB_STORES, client, created, insert_refresh, pytestmark, rows  # noqa: F401


def q(sql: str, **params):
    with engine.connect() as conn:
        return conn.execute(text(sql), params).all()


def execute(sql: str, **params) -> None:
    with engine.begin() as conn:
        conn.execute(text(sql), params)


def set_risk(run: int, item: str, store: str, probability: float, level: str) -> None:
    execute("UPDATE stockout_predictions SET probability = :p, risk_level = :l "
            "WHERE model_run_id = :r AND item_id = :i AND store_id = :s", p=probability, l=level, r=run, i=item, s=store)


def test_latest_successful_run_is_used_and_failed_or_incomplete_runs_are_excluded(client):
    demand, run = insert_refresh()
    insert_refresh(status="failed")
    insert_refresh(status="running")
    bad_demand, _ = insert_refresh()                     # stockout run completed, but its forecast run failed
    execute("UPDATE model_runs SET status = 'failed' WHERE id = :id", id=bad_demand)

    summary = client.get("/dashboard/summary").json()
    assert summary["prediction_run"]["stockout"]["model_run_id"] == run
    assert summary["prediction_run"]["demand_forecast"]["model_run_id"] == demand
    assert summary["latest_prediction_timestamp"] == summary["prediction_run"]["completed_at"]
    assert summary["model_versions"] == {"demand_forecast": "test", "stockout": "test"}
    assert client.get("/predictions/status").json()["stockout"]["model_run_id"] == run

    forecasts = client.get("/forecasts", params={"limit": 1000}).json()
    assert forecasts["run"]["demand_forecast"]["model_run_id"] == demand
    assert forecasts["total"] == len(ITEMS) * len(SUB_STORES) * 4
    assert {f["model_run_id"] for f in forecasts["items"]} == {demand}
    risks = client.get("/stockout-risks", params={"limit": 1000}).json()
    assert risks["total"] == len(ITEMS) * len(SUB_STORES) and {r["model_run_id"] for r in risks["items"]} == {run}


def test_forecast_filters_pagination_and_order(client):
    demand, _ = insert_refresh(p50=70)
    one = client.get("/forecasts", params={"item_id": ITEMS[1], "store_id": SUB_STORES[0], "horizon": 3}).json()
    assert one["total"] == 1
    row = one["items"][0]
    saved = q("SELECT p50, p90, target_week FROM forecast_predictions WHERE model_run_id = :r AND item_id = :i "
              "AND store_id = :s AND horizon = 3", r=demand, i=ITEMS[1], s=SUB_STORES[0])[0]
    assert (row["p50"], row["p90"], row["target_week"]) == (saved.p50, saved.p90, saved.target_week.isoformat())
    assert row["item_name"] and row["store_name"] and row["unit"]

    full = client.get("/forecasts", params={"horizon": 2}).json()
    assert full["total"] == len(ITEMS) * len(SUB_STORES) and {f["horizon"] for f in full["items"]} == {2}
    keys = [(f["item_id"], f["store_id"], f["horizon"]) for f in client.get("/forecasts").json()["items"]]
    assert keys == sorted(keys)
    pages = [client.get("/forecasts", params={"limit": 5, "offset": o}).json()["items"] for o in range(0, 24, 5)]
    assert [(f["item_id"], f["store_id"], f["horizon"]) for p in pages for f in p] == keys

    assert client.get("/forecasts", params={"horizon": 0}).status_code == 422
    assert client.get("/forecasts", params={"store_id": "STR-999"}).status_code == 404
    assert client.get("/forecasts", params={"item_id": "NOPE"}).status_code == 404
    assert client.get("/forecasts", params={"limit": 1001}).status_code == 422


def test_stockout_risks_return_saved_probability_and_level(client):
    _, run = insert_refresh()
    set_risk(run, ITEMS[0], SUB_STORES[1], 0.5, "URGENT")
    set_risk(run, ITEMS[2], SUB_STORES[0], 0.1, "REVIEW")

    body = client.get("/stockout-risks").json()
    probs = [r["probability"] for r in body["items"]]
    assert probs == sorted(probs, reverse=True)
    top = body["items"][0]
    assert (top["item_id"], top["store_id"], top["probability"], top["risk_level"]) == (ITEMS[0], SUB_STORES[1], 0.5, "URGENT")
    assert (top["horizon_days"], top["threshold_review"], top["threshold_urgent"]) == (14, 0.0416, 0.2126)

    review = client.get("/stockout-risks", params={"risk_level": "REVIEW"}).json()
    assert [(r["item_id"], r["store_id"]) for r in review["items"]] == [(ITEMS[2], SUB_STORES[0])]
    by_item = client.get("/stockout-risks", params={"item_id": ITEMS[0], "store_id": SUB_STORES[0]}).json()
    assert by_item["total"] == 1 and by_item["items"][0]["risk_level"] == "LOW"
    assert client.get("/stockout-risks", params={"risk_level": "HIGH"}).status_code == 422


def test_dashboard_counts_each_item_once(client):
    _, run = insert_refresh(p50=700)
    set_risk(run, ITEMS[0], SUB_STORES[0], 0.5, "URGENT")      # item 0: URGENT + REVIEW -> counted once, as URGENT
    set_risk(run, ITEMS[0], SUB_STORES[1], 0.1, "REVIEW")
    set_risk(run, ITEMS[1], SUB_STORES[0], 0.1, "REVIEW")      # item 1: REVIEW + LOW -> REVIEW; item 2: LOW

    before = client.get("/dashboard/summary").json()
    total = q("SELECT count(*) FROM medical_items")[0][0]
    assert before["total_items"] == total
    assert before["stockout_risk_counts"] == {"URGENT": 1, "REVIEW": 1, "LOW": 1}
    assert before["items_without_stockout_prediction"] == total - len(ITEMS)
    assert before["latest_data_date"] == q("SELECT max(date) FROM daily_inventory")[0][0].isoformat()
    # no set for this run yet: nothing is counted from older sets
    assert before["recommendation_set"]["status"] == "missing" and before["recommendation_set"]["model_run_id"] is None
    assert before["recommendation_priority_counts"] is None and before["items_needing_attention"] is None

    client.post("/recommendations/refresh", params={"model_run_id": run})
    after = client.get("/dashboard/summary").json()
    saved = rows(run)
    assert len(saved) > len({r.item_id for r in saved})        # transfer rows exist, so items would be double-counted
    rank = {"HIGH": 0, "MODERATE": 1, "LOW": 2}
    top = {}
    for r in saved:
        top[r.item_id] = min(top.get(r.item_id, 2), rank[r.priority])
    expected = {p: sum(1 for t in top.values() if t == n) for p, n in rank.items()}
    attention = {r.item_id for r in saved if r.action != "NONE" or r.priority != "LOW"}
    assert after["recommendation_set"]["status"] == "current" and after["recommendation_set"]["model_run_id"] == run
    assert after["recommendation_priority_counts"] == expected and sum(expected.values()) == len(ITEMS)
    assert after["items_needing_attention"] == len(attention)


def test_stale_recommendation_set_is_not_presented_as_current(client):
    _, older = insert_refresh(p50=700, probability=0.5)
    client.post("/recommendations/refresh", params={"model_run_id": older})
    _, newer = insert_refresh()                                # newer run, no recommendation set

    summary = client.get("/dashboard/summary").json()
    assert summary["recommendation_set"] == {"status": "missing", "model_run_id": None, "generated_at": None,
                                             "latest_available_model_run_id": older}
    assert summary["recommendation_priority_counts"] is None
    analysis = client.get(f"/products/{ITEMS[0]}/analysis").json()
    assert analysis["prediction_run"]["stockout"]["model_run_id"] == newer
    assert analysis["recommendation"]["item_status"] == "set_missing" and analysis["recommendation"]["rows"] == []
    listed = client.get("/recommendations").json()
    assert listed["model_run_id"] == older and listed["freshness"] == "stale" and listed["latest_prediction_run_id"] == newer


def test_recommendations_status_filter_and_store_names(client):
    _, run = insert_refresh(p50=700, probability=0.5)
    client.post("/recommendations/refresh", params={"model_run_id": run})
    accepted = rows(run)[0].id
    execute("UPDATE recommendations SET status = 'ACCEPTED' WHERE id = :id", id=accepted)

    body = client.get("/recommendations", params={"status": "ACCEPTED"}).json()
    assert [r["id"] for r in body["items"]] == [accepted] and body["total"] == 1
    pending = client.get("/recommendations", params={"status": "PENDING", "limit": 1000}).json()
    assert accepted not in {r["id"] for r in pending["items"]} and pending["total"] == len(rows(run)) - 1
    transfers = client.get("/recommendations", params={"action": "TRANSFER", "priority": "HIGH"}).json()["items"]
    assert transfers and all(r["store_id"] in SUB_STORES and r["store_name"] for r in transfers)
    assert all(r["data_cutoff_date"] == body["data_cutoff_date"] for r in transfers)
    assert client.get("/recommendations", params={"status": "DONE"}).status_code == 422


def test_product_analysis_combines_saved_results_and_context(client):
    demand, run = insert_refresh(p50=70)
    set_risk(run, ITEMS[0], SUB_STORES[1], 0.3, "URGENT")
    client.post("/recommendations/refresh", params={"model_run_id": run})
    body = client.get(f"/products/{ITEMS[0]}/analysis").json()

    assert body["item"]["item_id"] == ITEMS[0]
    assert body["prediction_run"]["stockout"]["model_run_id"] == run
    assert len(body["forecast"]["by_store"]) == len(SUB_STORES) * 4
    assert [t["horizon"] for t in body["forecast"]["totals"]] == [1, 2, 3, 4]
    assert all(t["p50"] == pytest.approx(70 * len(SUB_STORES)) for t in body["forecast"]["totals"])
    assert body["stockout_risk"]["highest"]["store_id"] == SUB_STORES[1]
    assert body["stockout_risk"]["highest"]["probability"] == 0.3

    saved = [r for r in rows(run) if r.item_id == ITEMS[0]]
    rec = body["recommendation"]
    assert rec["item_status"] == "available" and rec["recommendation_set"]["model_run_id"] == run
    assert sorted(r["id"] for r in rec["rows"]) == sorted(r.id for r in saved)
    by_id = {r.id: r for r in saved}
    for shown in rec["rows"]:                                # persisted values, not recalculated
        stored = by_id[shown["id"]]
        assert (shown["action"], shown["priority"], shown["store_id"], shown["recommended_purchase_quantity"],
                shown["transfer_quantity"], shown["reason"]) == \
               (stored.action, stored.priority, stored.store_id, stored.recommended_quantity, stored.transfer_qty,
                stored.reason)
        assert shown["reorder_point"] == round(stored.reorder_point, 2)
    item_row = saved[0]

    as_of = q("SELECT max(date) FROM daily_inventory WHERE item_id = :i", i=ITEMS[0])[0][0]
    central = q("SELECT closing_qty FROM daily_inventory WHERE item_id = :i AND date = :d AND store_id = 'STR-001'",
                i=ITEMS[0], d=as_of)[0][0]
    assert body["current_stock"]["as_of_date"] == as_of.isoformat()
    assert body["current_stock"]["central_store_qty"] == central
    assert body["open_purchase_orders"]["quantity"] == sum(o["ordered_quantity"] for o in body["open_purchase_orders"]["orders"])
    [supplier] = body["preferred_suppliers"]
    assert supplier["supplier_id"] == item_row.supplier_id
    assert supplier["lead_time"]["mean_days"] == pytest.approx(item_row.lead_time, abs=0.01)

    other = client.get("/products/MED-000010/analysis").json()          # real item, not in this test run
    assert other["forecast"]["by_store"] == [] and other["stockout_risk"]["highest"] is None
    assert other["recommendation"]["item_status"] == "item_not_included"
    assert client.get("/products/NOPE/analysis").status_code == 404


def test_no_successful_run_is_handled(client, monkeypatch):
    monkeypatch.setattr(dashboard_api, "latest_completed_run_id", lambda conn: None)
    summary = client.get("/dashboard/summary")
    assert summary.status_code == 200
    body = summary.json()
    assert body["prediction_run"] is None and body["stockout_risk_counts"] is None and body["model_versions"] is None
    assert body["recommendation_set"]["status"] == "missing" and body["total_items"] > 0
    assert client.get("/forecasts").status_code == 404
    assert client.get("/stockout-risks").status_code == 404
    analysis = client.get(f"/products/{ITEMS[0]}/analysis").json()
    assert analysis["prediction_run"] is None and analysis["recommendation"] is None and analysis["forecast"] is None
    assert analysis["current_stock"] is not None


def test_get_endpoints_never_predict_generate_or_write(client, monkeypatch):
    _, run = insert_refresh(p50=700, probability=0.5)
    client.post("/recommendations/refresh", params={"model_run_id": run})

    def forbidden(*args, **kwargs):
        raise AssertionError("a GET endpoint ran a model or generated recommendations")

    for module, name in ((model_runs, "refresh_predictions"), (model_runs, "predict"), (predictions_service, "predict"),
                         (recommendations_service, "generate_recommendations"),
                         (recommendations_service, "build_recommendations")):
        monkeypatch.setattr(module, name, forbidden)
    state = """SELECT (SELECT count(*) || '/' || max(id) || '/' || max(completed_at) FROM model_runs),
                      (SELECT count(*) || '/' || max(id) FROM forecast_predictions),
                      (SELECT count(*) || '/' || max(id) FROM stockout_predictions),
                      (SELECT count(*) || '/' || max(id) || '/' || string_agg(DISTINCT status, ',') FROM recommendations)"""
    before = q(state)
    for url in ("/dashboard/summary", "/forecasts", "/stockout-risks", "/recommendations", f"/products/{ITEMS[0]}/analysis"):
        assert client.get(url).status_code == 200, url
    assert q(state) == before
