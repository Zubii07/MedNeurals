# Phase 7: prediction refresh persistence against the real PostgreSQL DB. predict() is replaced by the Phase 6 flow on
# the small synthetic history from test_predictions (fast); everything else - model_runs, COPY, transactions, the
# status query and the endpoints - is the real code. Only the runs created here are deleted afterwards.

import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

import app.services.model_runs as model_runs
from app.database.connection import engine
from app.main import app
from app.ml.artifacts import get_artifacts
from app.services.feature_inputs import prediction_date_for
from app.services.predictions import PredictionError, run_predictions
from tests.test_predictions import history


def _db_ready() -> bool:
    try:
        with engine.connect() as conn:
            return conn.execute(text("SELECT to_regclass('model_runs') IS NOT NULL AND "
                                     "EXISTS (SELECT 1 FROM daily_inventory)")).scalar()
    except OperationalError:
        return False


pytestmark = pytest.mark.skipif(not _db_ready(), reason="needs PostgreSQL with Migration B applied and inventory data")


def fake_predict(conn, data_cutoff, artifacts):
    """Phase 6 run_predictions on synthetic history ending on the real prediction date of the cutoff."""
    as_of = prediction_date_for(data_cutoff)
    return run_predictions({**history(end=as_of, days=146), "prediction_date": as_of}, data_cutoff, artifacts)


@pytest.fixture
def created_runs():
    """Records the run ids a test creates and deletes them (and their predictions) afterwards."""
    with engine.connect() as conn:
        start = conn.execute(text("SELECT coalesce(max(id), 0) FROM model_runs")).scalar()
    yield
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM forecast_predictions WHERE model_run_id > :id"), {"id": start})
        conn.execute(text("DELETE FROM stockout_predictions WHERE model_run_id > :id"), {"id": start})
        conn.execute(text("DELETE FROM model_runs WHERE id > :id"), {"id": start})


@pytest.fixture
def client(monkeypatch, created_runs):
    monkeypatch.setattr(model_runs, "predict", fake_predict)
    with TestClient(app) as c:
        yield c


def counts(run_id: int) -> tuple[int, int]:
    with engine.connect() as conn:
        return (conn.execute(text("SELECT count(*) FROM forecast_predictions WHERE model_run_id = :id"), {"id": run_id}).scalar(),
                conn.execute(text("SELECT count(*) FROM stockout_predictions WHERE model_run_id = :id"), {"id": run_id}).scalar())


def test_two_refreshes_are_both_kept_and_traceable(client):
    first = client.post("/predictions/refresh")
    second = client.post("/predictions/refresh")
    assert first.status_code == second.status_code == 200
    first, second = first.json(), second.json()
    artifacts = get_artifacts()

    for body in (first, second):
        demand, stockout = body["demand_forecast"], body["stockout"]
        assert body["status"] == demand["status"] == stockout["status"] == "completed"
        assert (demand["model_name"], demand["model_version"]) == (artifacts.demand_model_name, artifacts.demand_model_version)
        assert (stockout["model_name"], stockout["model_version"]) == (artifacts.stockout_model_name, artifacts.stockout_model_version)
        assert demand["feature_version"] == stockout["feature_version"] == artifacts.feature_version
        cutoff = datetime.date.fromisoformat(body["data_cutoff_date"])
        assert body["prediction_date"] == prediction_date_for(cutoff).isoformat()
        # saved rows = generated rows (2 stores x 4 horizons, 1 sub-store), each under its own run
        assert (body["forecast_count"], body["stockout_count"]) == (8, 1)
        assert counts(demand["model_run_id"]) == (8, 0)
        assert counts(stockout["model_run_id"]) == (0, 1)

    assert second["stockout"]["model_run_id"] > first["stockout"]["model_run_id"]
    assert counts(first["demand_forecast"]["model_run_id"]) == (8, 0)    # first refresh still there
    assert client.get("/predictions/status").json() == second


def test_saved_rows_carry_the_run_dates(client):
    body = client.post("/predictions/refresh").json()
    prediction_date = datetime.date.fromisoformat(body["prediction_date"])
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT f.prediction_date, f.horizon, f.target_week, r.model_type, r.data_cutoff_date
            FROM forecast_predictions f JOIN model_runs r ON r.id = f.model_run_id
            WHERE f.model_run_id = :id"""), {"id": body["demand_forecast"]["model_run_id"]}).all()
        so = conn.execute(text("""
            SELECT s.prediction_date, s.horizon_days, s.threshold_review, s.threshold_urgent, r.model_type,
                   r.demand_model_run_id
            FROM stockout_predictions s JOIN model_runs r ON r.id = s.model_run_id
            WHERE s.model_run_id = :id"""), {"id": body["stockout"]["model_run_id"]}).one()
    assert {r.model_type for r in rows} == {"demand_forecast"}
    assert all(r.prediction_date == prediction_date for r in rows)
    # H1 is the week after the last complete demand week, never a week whose demand was used as input
    h1 = {r.target_week for r in rows if r.horizon == 1}
    assert len(h1) == 1 and h1.pop() >= prediction_date
    a = get_artifacts()
    assert so.model_type == "stockout" and so.prediction_date == prediction_date
    assert so.demand_model_run_id == body["demand_forecast"]["model_run_id"]
    assert (so.horizon_days, so.threshold_review, so.threshold_urgent) == (a.stockout_horizon_days, a.threshold_review, a.threshold_urgent)


def test_failed_save_leaves_no_rows_and_keeps_last_success(client, monkeypatch):
    good = client.post("/predictions/refresh").json()

    def bad_predict(conn, data_cutoff, artifacts):
        run = fake_predict(conn, data_cutoff, artifacts)
        run.stockout["store_id"] = "STR-NOPE"     # FK violation on the second COPY, after forecasts were written
        return run

    monkeypatch.setattr(model_runs, "predict", bad_predict)
    with pytest.raises(Exception):
        client.post("/predictions/refresh")

    with engine.connect() as conn:
        failed = conn.execute(text("SELECT id, model_type, status, error_message, prediction_count FROM model_runs "
                                   "WHERE id > :id ORDER BY id"), {"id": good["stockout"]["model_run_id"]}).all()
    assert [(r.model_type, r.status, r.prediction_count) for r in failed] == [
        ("demand_forecast", "failed", 0), ("stockout", "failed", 0)]
    assert all(r.error_message for r in failed)
    assert all(counts(r.id) == (0, 0) for r in failed)                  # forecast COPY was rolled back too
    assert client.get("/predictions/status").json() == good
    assert counts(good["demand_forecast"]["model_run_id"]) == (8, 0)


def test_prediction_error_is_recorded_and_returns_400(client, monkeypatch):
    good = client.post("/predictions/refresh").json()

    def no_data(conn, data_cutoff, artifacts):
        raise PredictionError("demand history must include the complete week")

    monkeypatch.setattr(model_runs, "predict", no_data)
    response = client.post("/predictions/refresh")
    assert response.status_code == 400 and "complete week" in response.json()["detail"]
    with engine.connect() as conn:
        statuses = conn.execute(text("SELECT status FROM model_runs WHERE id > :id"),
                                {"id": good["stockout"]["model_run_id"]}).scalars().all()
    assert statuses == ["failed", "failed"]
    assert client.get("/predictions/status").json() == good


def test_status_breaks_completed_at_ties_by_id(client):
    first = client.post("/predictions/refresh").json()
    second = client.post("/predictions/refresh").json()
    with engine.begin() as conn:
        conn.execute(text("UPDATE model_runs SET completed_at = :t WHERE id IN (:a, :b)"),
                     {"t": first["completed_at"], "a": first["stockout"]["model_run_id"],
                      "b": second["stockout"]["model_run_id"]})
    assert client.get("/predictions/status").json()["stockout"]["model_run_id"] == second["stockout"]["model_run_id"]


def test_status_without_successful_run_is_404(client, monkeypatch):
    monkeypatch.setattr("app.api.predictions.latest_completed_run_id", lambda conn: None)
    response = client.get("/predictions/status")
    assert response.status_code == 404
