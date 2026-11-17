# Phase 12: plain-language explanations. The number check and the template need no DB; the endpoint test uses the real
# PostgreSQL DB with a fake Gemini (never the network) and cleans up through the test_recommendations fixtures.

import datetime

import pytest

import app.services.explanations as explanations
from app.core.config import settings
from app.database.connection import engine
from app.services.explanations import allowed_numbers, build_facts, check_text, generate, template_text
from tests.test_recommendations import ITEMS, client, created, insert_refresh, pytestmark as db_pytestmark  # noqa: F401

FACTS = {
    "item": "Cotton Roller Bandage - 10 cm", "unit": "Roll", "prediction_date": "2025-12-07",
    "stockout_horizon_days": 14, "highest_risk_store": "Neonatal & Paediatric Sub-Store",
    "stockout_probability_percent": 95, "risk_level": "high", "store_stock_on_hand": 0, "store_daily_use": 8.9,
    "store_days_of_cover": 0, "store_stockout_days_last_28": 4, "central_store_stock": 0,
    "total_stock_all_stores": 136, "quantity_on_order": 5000, "next_delivery_date": "2025-12-11",
    "next_delivery_in_days": 4, "next_delivery_quantity": 5000, "next_delivery_purchase_order": "PO2-009169",
    "supplier": "Healing Touch Consumables", "supplier_lead_time_days": 11.0, "expected_demand_next_4_weeks": 1843,
    "recommended_action": "Expedite the open purchase order", "recommended_priority": "high",
    "recommended_purchase_quantity": None, "purchase_order_to_expedite": "PO2-009169", "transfer_count": 7,
    "transfer_total_quantity": 971, "rule_engine_reason": "At-risk sub-stores need 971 units soon but the central store has 0.",
}


def test_numbers_in_facts_are_allowed_in_several_spellings():
    allowed = allowed_numbers(FACTS)
    assert {"95", "8.9", "5000", "11", "11.0", "2025", "12", "4", "971", "009169"} <= allowed
    assert "42" not in allowed


def test_answer_with_an_invented_number_is_rejected():
    assert check_text("The 40 units on hand may last about four days.", FACTS).startswith("numbers not in the facts: 40")
    assert check_text("Stockout risk is 95% at Neonatal & Paediatric Sub-Store; 5,000 Roll arrive in 4 days.", FACTS) is None
    assert check_text("**Risk**: 95%", FACTS) == "markdown in answer"
    assert check_text("word " * 100, FACTS).startswith("too long")
    assert check_text("   ", FACTS) == "empty answer"


def test_template_uses_only_the_facts():
    text = template_text(FACTS)
    assert check_text(text, FACTS) is None
    assert "95%" in text and "PO2-009169" in text and "in 4 days" in text and "high priority" in text
    purchase = {**FACTS, "recommended_action": "Purchase", "purchase_order_to_expedite": None, "recommended_purchase_quantity": 2500}
    assert "purchase of 2,500 Roll" in template_text(purchase)
    assert check_text(template_text(purchase), purchase) is None


def test_generate_falls_back_to_the_template(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", None)
    text, source, model, note = generate(FACTS)
    assert source == "template" and model is None and "GEMINI_API_KEY" in note and text == template_text(FACTS)

    monkeypatch.setattr(settings, "gemini_api_key", "test-key")
    monkeypatch.setattr(explanations, "call_gemini", lambda prompt, key, model: "About 40 units are left.")
    text, source, model, note = generate(FACTS)
    assert source == "template" and note.startswith("answer rejected: numbers not in the facts: 40")

    monkeypatch.setattr(explanations, "call_gemini", lambda prompt, key, model: (_ for _ in ()).throw(RuntimeError("quota")))
    text, source, model, note = generate(FACTS)
    assert source == "template" and note.startswith("gemini call failed")

    good = "Risk of running out is 95% at Neonatal & Paediatric Sub-Store with none on hand.\n\nExpedite PO2-009169."
    monkeypatch.setattr(explanations, "call_gemini", lambda prompt, key, model: good)
    text, source, model, note = generate(FACTS)
    assert source == "llm" and model == settings.gemini_model and note is None and "\n" not in text


pytestmark = db_pytestmark


def test_explanation_endpoint_caches_per_run_and_item(client, monkeypatch):
    _, run = insert_refresh(p50=700, probability=0.5)
    client.post("/recommendations/refresh", params={"model_run_id": run})
    calls = []

    def fake_gemini(prompt, key, model):
        calls.append(prompt)
        return "This answer invents 12345 units."           # rejected -> template, still cached

    monkeypatch.setattr(settings, "gemini_api_key", "test-key")
    monkeypatch.setattr(explanations, "call_gemini", fake_gemini)

    first = client.post(f"/products/{ITEMS[0]}/explanation")
    assert first.status_code == 200, first.text
    body = first.json()
    assert body["model_run_id"] == run and body["source"] == "template" and "12345" in body["note"]
    facts = build_facts(client.get(f"/products/{ITEMS[0]}/analysis").json())
    assert check_text(body["text"], facts) is None
    assert len(calls) == 1 and f'"item": "{facts["item"]}"' in calls[0] and "ONLY the facts" in calls[0]

    second = client.post(f"/products/{ITEMS[0]}/explanation")
    assert second.json() == body and len(calls) == 1            # reused, no second call

    # a paragraph cached while no key was configured is regenerated once a key exists
    monkeypatch.setattr(settings, "gemini_api_key", None)
    without_key = client.post(f"/products/{ITEMS[1]}/explanation").json()
    assert without_key["source"] == "template" and without_key["note"] == "GEMINI_API_KEY not set"
    monkeypatch.setattr(settings, "gemini_api_key", "test-key")
    good = f"Stockout risk is {facts['stockout_probability_percent']}% at {facts['highest_risk_store']}."
    monkeypatch.setattr(explanations, "call_gemini", lambda prompt, key, model: good)
    facts = build_facts(client.get(f"/products/{ITEMS[1]}/analysis").json())
    good = f"Stockout risk is {facts['stockout_probability_percent']}% at {facts['highest_risk_store']}."
    monkeypatch.setattr(explanations, "call_gemini", lambda prompt, key, model: good)
    with_key = client.post(f"/products/{ITEMS[1]}/explanation").json()
    assert with_key["source"] == "llm" and with_key["text"] == good
    assert client.post(f"/products/{ITEMS[1]}/explanation").json() == with_key

    assert client.post("/products/MED-NOPE/explanation").status_code == 404
    with engine.connect() as conn:
        from sqlalchemy import text
        # one row per item for this run (the regenerated one replaced its template row, not added to it)
        assert conn.execute(text("SELECT count(*) FROM recommendation_explanations WHERE model_run_id = :r"), {"r": run}).scalar() == 2


def test_facts_handle_dates_and_missing_sections():
    analysis = {
        "item": {"item_id": "X", "item_name": "Thing", "uom": "Box"},
        "prediction_run": {"prediction_date": "2025-12-07", "stockout": {"model_run_id": 1}},
        "recommendation": None, "stockout_risk": None, "forecast": None, "current_stock": None,
        "open_purchase_orders": {"as_of_date": datetime.date(2025, 12, 7), "quantity": 10, "orders": [
            {"purchase_order_id": "PO-1", "supplier_id": "S", "order_date": datetime.date(2025, 12, 1),
             "expected_delivery_date": datetime.date(2025, 12, 15), "ordered_quantity": 10}]},
        "preferred_suppliers": [],
    }
    facts = build_facts(analysis)
    assert facts["next_delivery_in_days"] == 8 and facts["next_delivery_date"] == "2025-12-15"
    assert facts["highest_risk_store"] is None and facts["recommended_action"] is None
    assert check_text(template_text(facts), facts) is None
    assert build_facts({**analysis, "prediction_run": None}) is None
