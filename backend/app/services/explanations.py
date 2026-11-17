"""One short paragraph per item for the procurement officer (CLAUDE.md rule 8 / BACKEND_PLAN Phase 12).

The LLM only puts stored results into words. The backend builds a small set of facts (already rounded), asks Gemini
for one paragraph that uses nothing else, and then checks the answer: every number in the text must be one of the
numbers in the facts. If the check fails, the key is missing, or the call fails, a fixed template built from the same
facts is used instead. The result is saved per (stockout run, item) and reused until the next prediction refresh.
"""

import datetime
import json
import logging
import re
import time

import httpx
from sqlalchemy import text
from sqlalchemy.engine import Connection, Engine

from app.core.config import settings
from app.models.explanations import SOURCE_LLM, SOURCE_TEMPLATE

logger = logging.getLogger(__name__)

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
GEMINI_TIMEOUT_S = 25.0
GEMINI_ATTEMPTS = 3
GEMINI_RETRY_PAUSE_S = 2.0
MAX_WORDS = 60            # asked of the model
MAX_WORDS_ACCEPTED = 90   # longer answers are replaced by the template
NO_KEY_NOTE = "GEMINI_API_KEY not set"
FAILED_CALL_NOTE = "gemini call failed"
FAILED_CALL_RETRY_AFTER = datetime.timedelta(minutes=10)   # a template written after a failed call is retried later

ACTION_WORDS = {
    "PURCHASE": "Purchase",
    "TRANSFER": "Transfer stock between stores",
    "EXPEDITE_PO": "Expedite the open purchase order",
    "NONE": "No purchase needed now",
}
RISK_WORDS = {"URGENT": "high", "REVIEW": "moderate", "LOW": "low"}

PROMPT = """You write for a hospital procurement officer who has no statistics background.
Write ONE paragraph of at most {max_words} words in plain English: no heading, no bullet points, no markdown, no greeting.
Use ONLY the facts below. Every number you write must appear in the facts exactly as written there; do not calculate,
round, convert or add any number, and do not mention a fact that is null. Do not place, promise or schedule an order
and do not tell the officer what will certainly happen: the officer decides.
Say, in this order: how likely a stockout is and at which store; why (stock on hand, daily use, days of cover, the
next delivery); and the recommended next step with its quantity or purchase order if given.
Write the way a colleague would speak: quantities with their unit (for example "5000 Roll", "about 8.9 Roll a day"),
"none on hand" rather than "stock on hand is 0", "in 4 days" rather than "4 days away", and the percentage as "95%".

Facts (JSON):
{facts}
"""


class ExplanationUnavailable(Exception):
    """No prediction run or no stored results for the item."""


# ------------------------------------------------------------------ facts

def _round1(value):
    return None if value is None else round(float(value), 1)


def _int(value):
    return None if value is None else int(round(float(value)))


def _date(value) -> datetime.date | None:
    """Dates arrive as date objects from the DB builder and as ISO strings from the JSON view; accept both."""
    if value is None or isinstance(value, datetime.date):
        return value
    return datetime.date.fromisoformat(str(value)[:10])


def build_facts(analysis: dict) -> dict | None:
    """The numbers and names the paragraph may use, taken from build_product_analysis output. None without a run."""
    run = analysis.get("prediction_run")
    if run is None:
        return None
    item = analysis["item"]
    unit = item["uom"]
    rec = analysis.get("recommendation") or {}
    rows = rec.get("rows") or []
    item_row = next((r for r in rows if r["action"] != "TRANSFER"), None)
    transfers = [r for r in rows if r["action"] == "TRANSFER"]
    risk = (analysis.get("stockout_risk") or {}).get("highest")
    stock = analysis.get("current_stock") or {}
    orders = (analysis.get("open_purchase_orders") or {}).get("orders") or []
    next_order = orders[0] if orders else None
    prediction_date = _date(run["prediction_date"])
    delivery_date = _date(next_order["expected_delivery_date"]) if next_order else None
    totals = (analysis.get("forecast") or {}).get("totals") or []
    supplier = (analysis.get("preferred_suppliers") or [None])[0]
    lead_time = (supplier or {}).get("lead_time") or {}

    facts = {
        "item": item["item_name"],
        "unit": unit,
        "prediction_date": prediction_date.isoformat(),
        "stockout_horizon_days": risk["horizon_days"] if risk else None,
        "highest_risk_store": risk["store_name"] if risk else None,
        "stockout_probability_percent": _int(risk["probability"] * 100) if risk else None,
        "risk_level": RISK_WORDS.get(risk["risk_level"]) if risk else None,
        "store_stock_on_hand": _int(risk.get("stock_on_hand")) if risk else None,
        "store_daily_use": _round1(risk.get("adu_28")) if risk else None,
        "store_days_of_cover": _int(risk.get("days_of_cover")) if risk else None,
        "store_stockout_days_last_28": _int(risk.get("stockout_days_last_28")) if risk else None,
        "central_store_stock": _int(stock.get("central_store_qty")),
        "total_stock_all_stores": _int(stock.get("total_qty")),
        "quantity_on_order": _int((analysis.get("open_purchase_orders") or {}).get("quantity")),
        "next_delivery_date": delivery_date.isoformat() if delivery_date else None,
        "next_delivery_in_days": (delivery_date - prediction_date).days if delivery_date else None,
        "next_delivery_quantity": _int(next_order["ordered_quantity"]) if next_order else None,
        "next_delivery_purchase_order": next_order["purchase_order_id"] if next_order else None,
        "supplier": (supplier or {}).get("supplier_name"),
        "supplier_lead_time_days": _round1(lead_time.get("mean_days")),
        "expected_demand_next_4_weeks": _int(sum(t["p50"] for t in totals)) if totals else None,
        "recommended_action": ACTION_WORDS.get(item_row["action"]) if item_row else ("Transfer stock between stores" if transfers else None),
        "recommended_priority": item_row["priority"].lower() if item_row else (transfers[0]["priority"].lower() if transfers else None),
        "recommended_purchase_quantity": _int(item_row["recommended_purchase_quantity"]) if item_row and item_row["action"] == "PURCHASE" else None,
        "purchase_order_to_expedite": (item_row.get("details") or {}).get("purchase_order_id") if item_row and item_row["action"] == "EXPEDITE_PO" else None,
        "transfer_count": len(transfers),
        "transfer_total_quantity": _int(sum(r["transfer_quantity"] for r in transfers)) if transfers else None,
        "rule_engine_reason": item_row["reason"] if item_row else (transfers[0]["reason"] if transfers else None),
    }
    return facts


# -------------------------------------------------------------- validation

_NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")


def allowed_numbers(facts: dict) -> set[str]:
    """Every number string the paragraph may contain: the numeric facts in a few spellings, and the parts of dates."""
    allowed = set()
    for value in facts.values():
        if isinstance(value, bool) or value is None:
            continue
        if isinstance(value, (int, float)):
            allowed.update(_spellings(value))
        elif isinstance(value, str):
            for part in _NUMBER.findall(value):      # dates ("2025-12-11"), PO ids ("PO2-009169"), reason text
                allowed.add(part.replace(",", ""))
    return allowed


def _spellings(value) -> set[str]:
    out = {str(value), f"{value:,}".replace(",", "")}
    if float(value).is_integer():
        out.add(str(int(value)))
    out.add(f"{float(value):.1f}")
    out.add(f"{float(value):.2f}")
    return out


def numbers_in(text_: str) -> list[str]:
    return [n.replace(",", "").rstrip(".") for n in _NUMBER.findall(text_)]


def check_text(text_: str, facts: dict) -> str | None:
    """None when the paragraph is acceptable, else the reason it is not."""
    cleaned = " ".join(text_.split())
    if not cleaned:
        return "empty answer"
    words = len(cleaned.split())
    if words > MAX_WORDS_ACCEPTED:
        return f"too long ({words} words)"
    lines = [line.strip() for line in text_.splitlines() if line.strip()]
    if "**" in cleaned or any(line.startswith(("#", "- ", "* ", "• ")) for line in lines):
        return "markdown in answer"
    allowed = allowed_numbers(facts)
    unknown = [n for n in numbers_in(cleaned) if n not in allowed]
    if unknown:
        return f"numbers not in the facts: {', '.join(sorted(set(unknown)))}"
    return None


# ---------------------------------------------------------------- template

def _qty(value, unit) -> str:
    return "none" if not value else f"{value:,} {unit}"


def template_text(f: dict) -> str:
    """Fixed wording from the same facts; always passes check_text."""
    unit = f["unit"]
    parts = []
    if f["highest_risk_store"] is not None:
        parts.append(f"{f['item']} is at {f['risk_level']} risk of running out at {f['highest_risk_store']}: "
                     f"{f['stockout_probability_percent']}% in the next {f['stockout_horizon_days']} days.")
        if f["store_stock_on_hand"] == 0:
            parts.append(f"That store has none on hand and uses about {f['store_daily_use']} {unit} a day.")
        elif f["store_days_of_cover"] is not None:
            parts.append(f"Its {_qty(f['store_stock_on_hand'], unit)} on hand cover roughly {f['store_days_of_cover']} days "
                         f"at about {f['store_daily_use']} {unit} a day.")
        else:
            parts.append(f"It has {_qty(f['store_stock_on_hand'], unit)} on hand and no recent use.")
    else:
        parts.append(f"{f['item']} has no stockout prediction for this run.")
    parts.append(f"The central store holds {_qty(f['central_store_stock'], unit)}.")
    if f["next_delivery_date"]:
        when = f"in {f['next_delivery_in_days']} days" if f["next_delivery_in_days"] > 0 else "now overdue" if f["next_delivery_in_days"] < 0 else "today"
        parts.append(f"The next delivery of {_qty(f['next_delivery_quantity'], unit)} is expected {when}, on {f['next_delivery_date']}.")
    else:
        parts.append("Nothing is on order.")
    action = f["recommended_action"]
    if action:
        detail = ""
        if f["recommended_purchase_quantity"]:
            detail = f" of {_qty(f['recommended_purchase_quantity'], unit)}"
        elif f["purchase_order_to_expedite"]:
            detail = f" {f['purchase_order_to_expedite']}"
        elif f["transfer_count"] and f["transfer_total_quantity"]:
            detail = f" ({f['transfer_count']} transfers, {_qty(f['transfer_total_quantity'], unit)} in total)"
        parts.append(f"Recommended next step: {action.lower()}{detail} ({f['recommended_priority']} priority).")
    return " ".join(parts)


# ------------------------------------------------------------------ gemini

def call_gemini(prompt: str, api_key: str, model: str) -> str:
    """One generateContent call over REST (no SDK dependency). A 429 / 503 ("high demand") is retried twice with a
    short pause; anything else raises at once."""
    for attempt in range(GEMINI_ATTEMPTS):
        response = httpx.post(
            GEMINI_URL.format(model=model),
            headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
            json={"contents": [{"parts": [{"text": prompt}]}],
                  "generationConfig": {"temperature": 0.2, "maxOutputTokens": 1024}},
            timeout=GEMINI_TIMEOUT_S,
        )
        if response.status_code in (429, 503) and attempt < GEMINI_ATTEMPTS - 1:
            time.sleep(GEMINI_RETRY_PAUSE_S * (attempt + 1))
            continue
        response.raise_for_status()
        body = response.json()
        return "".join(part.get("text", "") for part in body["candidates"][0]["content"]["parts"])
    raise RuntimeError("unreachable")


def generate(facts: dict) -> tuple[str, str, str | None, str | None]:
    """(text, source, provider_model, note). The template is used whenever the LLM answer cannot be trusted."""
    if not settings.gemini_api_key:
        return template_text(facts), SOURCE_TEMPLATE, None, NO_KEY_NOTE
    model = settings.gemini_model
    prompt = PROMPT.format(max_words=MAX_WORDS, facts=json.dumps(facts, indent=1))
    try:
        answer = call_gemini(prompt, settings.gemini_api_key, model)
    except Exception as exc:  # network, quota, auth, response shape: never fail the page over it
        logger.warning("Gemini call failed for %s: %s", facts.get("item"), exc)
        return template_text(facts), SOURCE_TEMPLATE, None, f"{FAILED_CALL_NOTE}: {str(exc)[:300]}"
    problem = check_text(answer, facts)
    if problem:
        logger.warning("Gemini answer rejected for %s: %s", facts.get("item"), problem)
        return template_text(facts), SOURCE_TEMPLATE, model, f"answer rejected: {problem}"
    return " ".join(answer.split()), SOURCE_LLM, model, None


# --------------------------------------------------------------- persistence

def _cached(conn: Connection, run_id: int, item_id: str) -> dict | None:
    row = conn.execute(text("""
        SELECT item_id, model_run_id, text, source, provider_model, note, created_at
        FROM recommendation_explanations WHERE model_run_id = :run AND item_id = :item"""),
        {"run": run_id, "item": item_id}).mappings().one_or_none()
    return dict(row) if row else None


def _should_retry(cached: dict | None) -> bool:
    if not cached or cached["source"] != SOURCE_TEMPLATE or not settings.gemini_api_key:
        return False
    note = cached["note"] or ""
    if note.startswith(NO_KEY_NOTE):
        return True
    if note.startswith(FAILED_CALL_NOTE):
        created = cached["created_at"]
        now = datetime.datetime.now(created.tzinfo) if created.tzinfo else datetime.datetime.now()
        return now - created >= FAILED_CALL_RETRY_AFTER
    return False


def explain_item(engine: Engine, analysis: dict) -> dict:
    """The paragraph for one item's current results (build_product_analysis output): cached per stockout run and
    item, generated on first request."""
    run = analysis.get("prediction_run")
    if run is None:
        raise ExplanationUnavailable("no successful prediction run yet; call POST /predictions/refresh")
    run_id = run["stockout"]["model_run_id"]
    item_id = analysis["item"]["item_id"]
    with engine.connect() as conn:
        cached = _cached(conn, run_id, item_id)
    # A template written because no key was configured is replaced once a key exists; one written after a failed
    # call is retried once it is old enough (so a provider outage does not slow every page view, nor stick forever).
    retry_without_key = _should_retry(cached)
    if cached and not retry_without_key:
        return cached
    facts = build_facts(analysis)
    if facts is None:
        raise ExplanationUnavailable("no stored results to explain for this item")
    text_, source, model, note = generate(facts)
    with engine.begin() as conn:
        if retry_without_key:
            conn.execute(text("DELETE FROM recommendation_explanations WHERE model_run_id = :run AND item_id = :item"),
                         {"run": run_id, "item": item_id})
        conn.execute(text("""
            INSERT INTO recommendation_explanations (model_run_id, item_id, text, source, provider_model, note)
            VALUES (:run, :item, :text, :source, :model, :note)
            ON CONFLICT (model_run_id, item_id) DO NOTHING"""),
            {"run": run_id, "item": item_id, "text": text_, "source": source, "model": model, "note": note})
        return _cached(conn, run_id, item_id)
