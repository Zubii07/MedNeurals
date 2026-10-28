# Phase 9: recommendation persistence, refresh traceability and endpoints against the real PostgreSQL DB. Each test
# inserts its own completed run pairs (forecast + stockout rows for a few real items, prediction date = the latest
# inventory date) and deletes only what it created.

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

import app.api.predictions as predictions_api
import app.services.model_runs as model_runs
from app.database.connection import engine
from app.main import app
from app.services.recommendations import RecommendationError
from tests.test_model_runs import fake_predict

ITEMS = ["MED-000001", "MED-000002", "MED-000003"]
SUB_STORES = ["STR-002", "STR-003"]


def _db_ready() -> bool:
    try:
        with engine.connect() as conn:
            return conn.execute(text("SELECT to_regclass('recommendations') IS NOT NULL AND "
                                     "EXISTS (SELECT 1 FROM daily_inventory)")).scalar()
    except OperationalError:
        return False


pytestmark = pytest.mark.skipif(not _db_ready(), reason="needs PostgreSQL with the recommendations migration and data")


@pytest.fixture
def created():
    with engine.connect() as conn:
        start = conn.execute(text("SELECT coalesce(max(id), 0) FROM model_runs")).scalar()
    yield
    with engine.begin() as conn:
        for table in ("recommendations", "forecast_predictions", "stockout_predictions"):
            conn.execute(text(f"DELETE FROM {table} WHERE model_run_id > :id"), {"id": start})
        conn.execute(text("DELETE FROM model_runs WHERE id > :id"), {"id": start})


@pytest.fixture
def client(created):
    with TestClient(app) as c:
        yield c


def insert_refresh(p50: float = 70.0, probability: float = 0.01, status: str = "completed") -> tuple[int, int]:
    """A completed demand_forecast + stockout run pair on the latest inventory date. Returns (demand_id, stockout_id)."""
    with engine.begin() as conn:
        p = conn.execute(text("SELECT max(date) FROM daily_inventory")).scalar()
        common = {"p": p, "status": status}
        demand_id = conn.execute(text("""
            INSERT INTO model_runs (model_type, model_name, model_version, feature_version, data_cutoff_date,
                                    prediction_date, status, completed_at)
            VALUES ('demand_forecast', 'test', 'test', 'test', :p, :p, :status, now()) RETURNING id"""), common).scalar()
        stockout_id = conn.execute(text("""
            INSERT INTO model_runs (model_type, model_name, model_version, feature_version, data_cutoff_date,
                                    prediction_date, demand_model_run_id, status, completed_at)
            VALUES ('stockout', 'test', 'test', 'test', :p, :p, :d, :status, now()) RETURNING id"""),
            {**common, "d": demand_id}).scalar()
        for item in ITEMS:
            for store in SUB_STORES:
                for h in (1, 2, 3, 4):
                    conn.execute(text("""
                        INSERT INTO forecast_predictions (model_run_id, store_id, item_id, prediction_date, horizon,
                                                          target_week, p50, p90)
                        VALUES (:r, :s, :i, :p, :h, :p + 7 * :h, :p50, :p90)"""),
                        {"r": demand_id, "s": store, "i": item, "p": p, "h": h, "p50": p50, "p90": p50 * 1.3})
                conn.execute(text("""
                    INSERT INTO stockout_predictions (model_run_id, store_id, item_id, prediction_date, horizon_days,
                                                      probability, risk_level, threshold_review, threshold_urgent)
                    VALUES (:r, :s, :i, :p, 14, :prob, 'LOW', 0.0416, 0.2126)"""),
                    {"r": stockout_id, "s": store, "i": item, "p": p, "prob": probability})
    return demand_id, stockout_id


def rows(run_id: int) -> list:
    with engine.connect() as conn:
        return conn.execute(text("SELECT * FROM recommendations WHERE model_run_id = :id ORDER BY id"), {"id": run_id}).all()


def test_each_refresh_keeps_its_own_traceable_set(client):
    demand_a, run_a = insert_refresh(p50=70)
    first = client.post("/recommendations/refresh", params={"model_run_id": run_a})
    demand_b, run_b = insert_refresh(p50=700, probability=0.5)
    second = client.post("/recommendations/refresh")              # default: latest completed run = run_b
    assert first.status_code == second.status_code == 200
    first, second = first.json(), second.json()

    assert (first["model_run_id"], first["demand_model_run_id"], first["created"]) == (run_a, demand_a, True)
    assert (second["model_run_id"], second["demand_model_run_id"], second["created"]) == (run_b, demand_b, True)
    assert first["item_count"] == second["item_count"] == len(ITEMS)
    assert {s["reason"] for s in first["skipped"]} == {"no demand forecast for this item in the forecast run"}

    saved_a = rows(run_a)
    assert all((r.model_run_id, r.demand_model_run_id) == (run_a, demand_a) for r in saved_a)
    assert all((r.model_run_id, r.demand_model_run_id) == (run_b, demand_b) for r in rows(run_b))
    assert {r.item_id for r in saved_a} == set(ITEMS)
    # ten times the demand -> higher safety stock in the later set; the earlier set is untouched
    ss = lambda run: {r.item_id: r.safety_stock for r in rows(run)}
    assert all(ss(run_b)[i] > ss(run_a)[i] for i in ITEMS)
    assert rows(run_a) == saved_a


def test_repeated_refresh_is_idempotent(client):
    _, run = insert_refresh()
    first = client.post("/recommendations/refresh", params={"model_run_id": run}).json()
    ids = [r.id for r in rows(run)]
    again = client.post("/recommendations/refresh", params={"model_run_id": run}).json()
    assert first["created"] is True and again["created"] is False
    assert again["skipped"] is None and again["row_count"] == first["row_count"]
    assert again["action_counts"] == first["action_counts"] and again["skipped_count"] == first["skipped_count"]
    assert [r.id for r in rows(run)] == ids


def test_get_recommendations_latest_set_and_filters(client):
    _, run_a = insert_refresh(p50=700, probability=0.5)
    _, run_b = insert_refresh(p50=70)
    for run in (run_a, run_b):
        client.post("/recommendations/refresh", params={"model_run_id": run})

    latest = client.get("/recommendations").json()
    assert latest["model_run_id"] == run_b and latest["total"] == len(rows(run_b))
    assert latest["latest_prediction_run_id"] == run_b and latest["is_latest"] is True
    row = latest["items"][0]
    assert row["product_id"] in ITEMS and row["product_name"] and row["unit"]
    assert row["details"]["supplier_name"] and row["model_run_id"] == run_b
    assert row["recommended_purchase_quantity"] >= 0 and row["transfer_quantity"] >= 0

    older = client.get("/recommendations", params={"model_run_id": run_a, "item_id": ITEMS[0]}).json()
    assert older["is_latest"] is False
    assert older["model_run_id"] == run_a and {r["product_id"] for r in older["items"]} == {ITEMS[0]}
    purchase = client.get("/recommendations", params={"model_run_id": run_a, "action": "PURCHASE"}).json()
    assert all(r["action"] == "PURCHASE" for r in purchase["items"])
    assert client.get("/recommendations", params={"action": "BUY"}).status_code == 422


def test_errors_for_unknown_incomplete_or_wrong_runs(client):
    demand, _ = insert_refresh()
    _, running = insert_refresh(status="running")
    assert client.post("/recommendations/refresh", params={"model_run_id": 10 ** 9}).status_code == 404
    assert client.post("/recommendations/refresh", params={"model_run_id": demand}).status_code == 409
    response = client.post("/recommendations/refresh", params={"model_run_id": running})
    assert response.status_code == 409 and "running" in response.json()["detail"]
    assert client.get("/recommendations", params={"model_run_id": 10 ** 9}).status_code == 404


def test_prediction_refresh_generates_recommendations(client, monkeypatch):
    monkeypatch.setattr(model_runs, "predict", fake_predict)
    body = client.post("/predictions/refresh").json()
    rec = body["recommendations"]
    assert rec["status"] == "generated" and rec["summary"]["created"] is True
    assert rec["summary"]["model_run_id"] == body["stockout"]["model_run_id"]
    assert rec["summary"]["demand_model_run_id"] == body["demand_forecast"]["model_run_id"]
    assert len(rows(body["stockout"]["model_run_id"])) == rec["summary"]["row_count"] > 0
    assert client.get("/predictions/status").json()["recommendations"] is None


def test_failed_recommendation_step_keeps_the_predictions(client, monkeypatch):
    monkeypatch.setattr(model_runs, "predict", fake_predict)

    def broken(engine, run_id):
        raise RecommendationError("no supplier data")

    monkeypatch.setattr(predictions_api, "generate_recommendations", broken)
    response = client.post("/predictions/refresh")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "completed"
    assert body["recommendations"] == {"status": "failed", "summary": None, "error": "no supplier data"}
    assert rows(body["stockout"]["model_run_id"]) == []
    retry = client.post("/recommendations/refresh", params={"model_run_id": body["stockout"]["model_run_id"]})
    assert retry.status_code == 200 and retry.json()["created"] is True


def test_unexpected_error_in_recommendation_step_is_reported_not_raised(client, monkeypatch):
    monkeypatch.setattr(model_runs, "predict", fake_predict)

    def crash(engine, run_id):
        raise KeyError("unexpected column")

    monkeypatch.setattr(predictions_api, "generate_recommendations", crash)
    response = client.post("/predictions/refresh")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "completed" and body["recommendations"]["status"] == "failed"
    assert "unexpected column" in body["recommendations"]["error"]
    _, latest_without_set = body["demand_forecast"]["model_run_id"], body["stockout"]["model_run_id"]
    listed = client.get("/recommendations")
    if listed.status_code == 200:                       # an older set exists: it is flagged as not the latest
        assert listed.json()["is_latest"] is False and listed.json()["latest_prediction_run_id"] == latest_without_set
