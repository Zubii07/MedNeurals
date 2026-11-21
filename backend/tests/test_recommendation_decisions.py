# Phase 11 officer actions: Accept / Adjust / Reject on recommendation rows, against the real PostgreSQL DB. Each test
# inserts its own run pairs (tests/test_recommendations.insert_refresh) and, where a specific action is needed, its own
# recommendation rows; it deletes only what it created. The officer is a real users row (the decision's foreign key
# needs one), injected through the same dependency override conftest.py uses for the fake admin.

import datetime
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, OperationalError

from app.api.deps import get_current_user
from app.database.connection import SessionLocal, engine
from app.main import app
from app.models.user import ROLE_OFFICER, User
from app.schemas.recommendations import DecisionRequest
from tests.conftest import FAKE_ADMIN
from tests.test_recommendations import ITEMS, insert_refresh

PREFIX = "test-decision-"


def _db_ready() -> bool:
    try:
        with engine.connect() as conn:
            return conn.execute(text("SELECT to_regclass('recommendation_decisions') IS NOT NULL AND "
                                     "EXISTS (SELECT 1 FROM daily_inventory)")).scalar()
    except OperationalError:
        return False


pytestmark = pytest.mark.skipif(not _db_ready(), reason="needs PostgreSQL with the recommendation_decisions migration and data")


@pytest.fixture
def created():
    """Deletes the runs, predictions, recommendations, decisions and test users created during the test."""
    with engine.connect() as conn:
        start = conn.execute(text("SELECT coalesce(max(id), 0) FROM model_runs")).scalar()
    yield
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM recommendation_decisions WHERE recommendation_id IN "
                          "(SELECT id FROM recommendations WHERE model_run_id > :id)"), {"id": start})
        for table in ("recommendations", "forecast_predictions", "stockout_predictions"):
            conn.execute(text(f"DELETE FROM {table} WHERE model_run_id > :id"), {"id": start})
        conn.execute(text("DELETE FROM model_runs WHERE id > :id"), {"id": start})
        conn.execute(text("DELETE FROM users WHERE email LIKE :p"), {"p": f"{PREFIX}%"})


@pytest.fixture
def officer(created):
    with SessionLocal() as db:
        user = User(name="Salma Officer", email=f"{PREFIX}{uuid.uuid4().hex[:10]}@example.test", password_hash="",
                    role=ROLE_OFFICER, is_active=True)
        db.add(user)
        db.commit()
        db.refresh(user)
        db.expunge(user)
    return user


@pytest.fixture
def client(officer):
    """Signed in as the test officer. `as_admin(client)` switches to the fake admin for one call."""
    app.dependency_overrides[get_current_user] = lambda: officer
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.pop(get_current_user, None)


def as_admin():
    app.dependency_overrides[get_current_user] = lambda: FAKE_ADMIN


def as_officer(officer):
    app.dependency_overrides[get_current_user] = lambda: officer


def insert_row(run: int, action: str, item: str, store: str | None = None, quantity: int = 0, po: str | None = None) -> int:
    """One recommendation row with plain inputs: enough for a decision, not a real calculation."""
    with engine.begin() as conn:
        run_row = conn.execute(text("SELECT demand_model_run_id, prediction_date, data_cutoff_date FROM model_runs WHERE id = :id"),
                               {"id": run}).one()
        supplier = conn.execute(text("SELECT supplier_id FROM suppliers ORDER BY supplier_id LIMIT 1")).scalar()
        return conn.execute(text("""
            INSERT INTO recommendations (model_run_id, demand_model_run_id, prediction_date, data_cutoff_date, item_id,
                supplier_id, store_id, purchase_order_id, action, priority, ved_class, z_value, forecast_p50, demand_std,
                lead_time, lead_time_std, lead_time_sample_size, current_stock, on_order_qty, open_po_count,
                stockout_probability, pack_size, moq_packs, inventory_position, safety_stock, reorder_point,
                order_up_to_level, recommended_quantity, transfer_qty, reason)
            VALUES (:run, :demand, :p, :cutoff, :item, :supplier, :store, :po, :action, 'HIGH', 'V', 2.05, 10, 2,
                7, 1, 5, 100, 50, :open_po, 0.5, 10, 1, 150, 30, 100, 170, :purchase_qty, :transfer_qty, 'test row')
            RETURNING id"""),
            {"run": run, "demand": run_row.demand_model_run_id, "p": run_row.prediction_date, "cutoff": run_row.data_cutoff_date,
             "item": item, "supplier": supplier, "store": store, "po": po, "action": action,
             "open_po": 1 if po else 0,
             "purchase_qty": quantity if action == "PURCHASE" else 0,
             "transfer_qty": quantity if action == "TRANSFER" else 0}).scalar()


def open_purchase_order() -> tuple[str, datetime.date]:
    with engine.connect() as conn:
        return conn.execute(text("SELECT purchase_order_id, expected_delivery_date FROM purchase_orders "
                                 "WHERE receipt_date IS NULL ORDER BY purchase_order_id LIMIT 1")).one()


def decision_rows(recommendation_id: int) -> list:
    with engine.connect() as conn:
        return conn.execute(text("SELECT * FROM recommendation_decisions WHERE recommendation_id = :id"), {"id": recommendation_id}).all()


def status_of(recommendation_id: int) -> str:
    with engine.connect() as conn:
        return conn.execute(text("SELECT status FROM recommendations WHERE id = :id"), {"id": recommendation_id}).scalar()


# ------------------------------------------------------------------ request validation (no database)

def test_decision_request_rules():
    assert DecisionRequest(decision="ACCEPTED").reason is None
    assert DecisionRequest(decision="ACCEPTED", reason="  ").reason is None
    assert DecisionRequest(decision="REJECTED", reason=" too much ").reason == "too much"
    assert DecisionRequest(decision="ADJUSTED", adjusted_quantity=350, reason="stock arriving").adjusted_quantity == 350
    for bad in (
        {"decision": "ACCEPTED", "adjusted_quantity": 5},
        {"decision": "REJECTED"},
        {"decision": "REJECTED", "reason": " ", },
        {"decision": "REJECTED", "reason": "no", "adjusted_quantity": 5},
        {"decision": "ADJUSTED", "reason": "why"},
        {"decision": "ADJUSTED", "reason": "why", "adjusted_quantity": 5, "adjusted_expected_date": "2026-01-05"},
        {"decision": "ADJUSTED", "adjusted_quantity": 5},
        {"decision": "ADJUSTED", "adjusted_quantity": -1, "reason": "why"},
        {"decision": "MAYBE"},
    ):
        with pytest.raises(ValueError):
            DecisionRequest(**bad)


# ------------------------------------------------------------------ the three decisions

def test_accept_records_the_officer_and_sets_the_status(client, officer):
    _, run = insert_refresh()
    as_admin()
    assert client.post("/recommendations/refresh", params={"model_run_id": run}).status_code == 200
    as_officer(officer)
    page = client.get("/recommendations").json()
    assert page["is_latest_set"] is True and page["status_counts"]["PENDING"] == page["total"] > 0
    row = page["items"][0]
    assert row["status"] == "PENDING" and row["decision"] is None

    response = client.post(f"/recommendations/{row['id']}/decision", json={"decision": "ACCEPTED"})
    assert response.status_code == 200, response.text
    saved = response.json()
    assert saved["id"] == row["id"] and saved["status"] == "ACCEPTED"
    d = saved["decision"]
    assert d["decision"] == "ACCEPTED" and d["decided_by_id"] == officer.id and d["decided_by_name"] == officer.name
    assert d["decided_at"] and d["adjusted_quantity"] is None and d["adjusted_expected_date"] is None and d["reason"] is None
    expected_original = row["recommended_purchase_quantity"] if row["action"] == "PURCHASE" else \
        row["transfer_quantity"] if row["action"] == "TRANSFER" else None
    assert d["original_quantity"] == expected_original
    # the recommendation itself is unchanged apart from its status
    for key in ("action", "priority", "recommended_purchase_quantity", "transfer_quantity", "reason", "details"):
        assert saved[key] == row[key]
    assert status_of(row["id"]) == "ACCEPTED" and len(decision_rows(row["id"])) == 1

    again = client.get("/recommendations").json()
    assert again["status_counts"]["ACCEPTED"] == 1 and again["status_counts"]["PENDING"] == page["total"] - 1
    listed = next(r for r in again["items"] if r["id"] == row["id"])
    assert listed["status"] == "ACCEPTED" and listed["decision"]["decided_by_name"] == officer.name
    only = client.get("/recommendations", params={"status": "ACCEPTED"}).json()
    assert [r["id"] for r in only["items"]] == [row["id"]]


def test_adjust_keeps_both_quantities_and_the_reason(client):
    _, run = insert_refresh()
    purchase = insert_row(run, "PURCHASE", ITEMS[0], quantity=500)
    transfer = insert_row(run, "TRANSFER", ITEMS[1], store="STR-002", quantity=200)

    response = client.post(f"/recommendations/{purchase}/decision",
                           json={"decision": "ADJUSTED", "adjusted_quantity": 350, "reason": "More stock arrives next week."})
    assert response.status_code == 200, response.text
    d = response.json()["decision"]
    assert response.json()["status"] == "ADJUSTED" and response.json()["recommended_purchase_quantity"] == 500
    assert (d["original_quantity"], d["adjusted_quantity"], d["reason"]) == (500, 350, "More stock arrives next week.")
    assert d["original_expected_date"] is None and d["adjusted_expected_date"] is None

    response = client.post(f"/recommendations/{transfer}/decision",
                           json={"decision": "ADJUSTED", "adjusted_quantity": 0, "reason": "That store refuses the transfer."})
    assert response.status_code == 200, response.text
    d = response.json()["decision"]
    assert (d["original_quantity"], d["adjusted_quantity"]) == (200, 0)
    assert status_of(transfer) == "ADJUSTED"


def test_expedite_is_adjusted_by_delivery_date(client):
    _, run = insert_refresh()
    po_id, expected = open_purchase_order()
    row = insert_row(run, "EXPEDITE_PO", ITEMS[2], po=po_id)
    prediction_date = client.get("/recommendations").json()["prediction_date"]
    requested = (datetime.date.fromisoformat(prediction_date) + datetime.timedelta(days=3)).isoformat()

    by_quantity = client.post(f"/recommendations/{row}/decision",
                              json={"decision": "ADJUSTED", "adjusted_quantity": 10, "reason": "sooner"})
    assert by_quantity.status_code == 422 and "delivery date" in by_quantity.json()["detail"]
    too_early = client.post(f"/recommendations/{row}/decision",
                            json={"decision": "ADJUSTED", "adjusted_expected_date": prediction_date, "reason": "sooner"})
    assert too_early.status_code == 422
    same = client.post(f"/recommendations/{row}/decision",
                       json={"decision": "ADJUSTED", "adjusted_expected_date": expected.isoformat(), "reason": "sooner"})
    assert same.status_code == 422

    response = client.post(f"/recommendations/{row}/decision",
                           json={"decision": "ADJUSTED", "adjusted_expected_date": requested, "reason": "Ask for delivery within 3 days."})
    assert response.status_code == 200, response.text
    d = response.json()["decision"]
    assert d["original_expected_date"] == expected.isoformat() and d["adjusted_expected_date"] == requested
    assert d["original_quantity"] is None and d["adjusted_quantity"] is None


def test_reject_needs_a_reason_and_keeps_the_recommendation(client, officer):
    _, run = insert_refresh()
    row = insert_row(run, "TRANSFER", ITEMS[0], store="STR-003", quantity=200)
    assert client.post(f"/recommendations/{row}/decision", json={"decision": "REJECTED"}).status_code == 422
    assert client.post(f"/recommendations/{row}/decision", json={"decision": "REJECTED", "reason": "   "}).status_code == 422
    assert status_of(row) == "PENDING" and decision_rows(row) == []

    response = client.post(f"/recommendations/{row}/decision",
                           json={"decision": "REJECTED", "reason": "The other store also needs its available stock."})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "REJECTED" and body["transfer_quantity"] == 200 and body["reason"] == "test row"
    assert body["decision"]["reason"] == "The other store also needs its available stock."
    assert body["decision"]["decided_by_id"] == officer.id


# ------------------------------------------------------------------ guards

def test_a_decision_is_final_and_cannot_be_duplicated(client):
    _, run = insert_refresh()
    row = insert_row(run, "PURCHASE", ITEMS[0], quantity=500)
    assert client.post(f"/recommendations/{row}/decision", json={"decision": "ACCEPTED"}).status_code == 200
    second = client.post(f"/recommendations/{row}/decision", json={"decision": "REJECTED", "reason": "changed my mind"})
    assert second.status_code == 409 and "already" in second.json()["detail"]
    assert status_of(row) == "ACCEPTED" and len(decision_rows(row)) == 1
    with pytest.raises(IntegrityError):              # the database itself refuses a second decision row
        with engine.begin() as conn:
            conn.execute(text("INSERT INTO recommendation_decisions (recommendation_id, user_id, decision) "
                              "SELECT :id, user_id, 'ACCEPTED' FROM recommendation_decisions WHERE recommendation_id = :id"),
                         {"id": row})


def test_only_officers_decide_and_admins_read(client, officer):
    _, run = insert_refresh()
    row = insert_row(run, "PURCHASE", ITEMS[0], quantity=500)
    as_admin()
    forbidden = client.post(f"/recommendations/{row}/decision", json={"decision": "ACCEPTED"})
    assert forbidden.status_code == 403 and forbidden.json()["detail"] == "Procurement officers only"
    assert status_of(row) == "PENDING"
    as_officer(officer)
    assert client.post(f"/recommendations/{row}/decision", json={"decision": "ACCEPTED"}).status_code == 200
    as_admin()
    seen = client.get("/recommendations", params={"status": "ACCEPTED"}).json()
    assert [r["id"] for r in seen["items"]] == [row] and seen["items"][0]["decision"]["decided_by_name"] == officer.name
    assert client.get("/recommendations/decisions").json()["total"] >= 1


def test_wrong_field_for_the_action_is_refused(client):
    _, run = insert_refresh()
    purchase = insert_row(run, "PURCHASE", ITEMS[0], quantity=500)
    none_row = insert_row(run, "NONE", ITEMS[1])
    same = client.post(f"/recommendations/{purchase}/decision", json={"decision": "ADJUSTED", "adjusted_quantity": 500, "reason": "x"})
    assert same.status_code == 422 and "same" in same.json()["detail"]
    dated = client.post(f"/recommendations/{purchase}/decision",
                        json={"decision": "ADJUSTED", "adjusted_expected_date": "2026-01-05", "reason": "x"})
    assert dated.status_code == 422
    nothing = client.post(f"/recommendations/{none_row}/decision", json={"decision": "ADJUSTED", "adjusted_quantity": 5, "reason": "x"})
    assert nothing.status_code == 422 and "nothing to adjust" in nothing.json()["detail"]
    assert client.post(f"/recommendations/{none_row}/decision", json={"decision": "ACCEPTED"}).status_code == 200
    assert client.post("/recommendations/999999999/decision", json={"decision": "ACCEPTED"}).status_code == 404
    assert status_of(purchase) == "PENDING"


def test_only_the_latest_set_can_be_decided(client):
    _, older = insert_refresh()
    old_row = insert_row(older, "PURCHASE", ITEMS[0], quantity=500)
    _, newer = insert_refresh()
    new_row = insert_row(newer, "PURCHASE", ITEMS[0], quantity=400)

    response = client.post(f"/recommendations/{old_row}/decision", json={"decision": "ACCEPTED"})
    assert response.status_code == 409 and "older set" in response.json()["detail"]
    assert status_of(old_row) == "PENDING"
    assert client.post(f"/recommendations/{new_row}/decision", json={"decision": "ACCEPTED"}).status_code == 200
    old_page = client.get("/recommendations", params={"model_run_id": older}).json()
    assert old_page["is_latest_set"] is False and old_page["status_counts"]["PENDING"] == 1
    assert client.get("/recommendations").json()["is_latest_set"] is True


def test_new_recommendation_sets_keep_earlier_decisions(client):
    _, older = insert_refresh()
    old_row = insert_row(older, "PURCHASE", ITEMS[0], quantity=500)
    assert client.post(f"/recommendations/{old_row}/decision",
                       json={"decision": "ADJUSTED", "adjusted_quantity": 350, "reason": "Extra stock arriving."}).status_code == 200
    _, newer = insert_refresh()
    new_row = insert_row(newer, "PURCHASE", ITEMS[0], quantity=450)

    assert status_of(old_row) == "ADJUSTED" and status_of(new_row) == "PENDING"
    old_page = client.get("/recommendations", params={"model_run_id": older}).json()
    assert old_page["items"][0]["decision"]["adjusted_quantity"] == 350

    history = client.get("/recommendations/decisions", params={"item_id": ITEMS[0]}).json()
    assert history["total"] >= 1
    first = history["items"][0]
    assert first["recommendation_id"] == old_row and first["product_id"] == ITEMS[0] and first["product_name"]
    assert (first["original_quantity"], first["adjusted_quantity"]) == (500, 350) and first["model_run_id"] == older
    assert first["decision"] == "ADJUSTED" and first["reason"] == "Extra stock arriving."
    assert client.get("/recommendations/decisions", params={"item_id": ITEMS[0], "decision": "REJECTED"}).json()["total"] == 0
    assert client.get("/recommendations/decisions", params={"decision": "MAYBE"}).status_code == 422


def test_product_analysis_shows_the_decision(client):
    _, run = insert_refresh()
    row = insert_row(run, "PURCHASE", ITEMS[0], quantity=500)
    assert client.post(f"/recommendations/{row}/decision", json={"decision": "REJECTED", "reason": "Budget freeze."}).status_code == 200
    analysis = client.get(f"/products/{ITEMS[0]}/analysis").json()
    rows = analysis["recommendation"]["rows"]
    mine = next(r for r in rows if r["id"] == row)
    assert mine["status"] == "REJECTED" and mine["decision"]["reason"] == "Budget freeze."
