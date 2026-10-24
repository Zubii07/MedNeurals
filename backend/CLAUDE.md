# MedNeurals – Hospital Procurement Decision-Support System (backend)

FYP project. Advisory system for a Lahore tertiary-care hospital: forecasts demand for patient-care
consumables, predicts stockout risk, and recommends purchases/transfers that a procurement officer accepts or rejects.

The full phase-by-phase plan is in `docs/BACKEND_PLAN.md`. Implement ONE phase at a time, only when asked.

## Stack
FastAPI · PostgreSQL · SQLAlchemy 2 · Alembic · pandas · scikit-learn · joblib. Frontend (React + TypeScript) is a separate project.

## Project layout
- `app/` FastAPI app (`main.py`, `api/`, `core/`, `db/`, `schemas/`, `services/`)
- `app/ml/trained/` trained artifacts from Colab: `demand_forecast_pipeline.joblib`, `stockout_pipeline.joblib`,
  `features.py`, `metrics.json`, `feature_columns.json`, reference CSVs (`reorder_recommendations_latest.csv`)
- `data/MedNeurals_dataset_v2/` source CSVs (`01_master/`, `02_transactions/`). `03_model_ready/` is training reference only.
- `alembic/` migrations · `scripts/` one-off scripts (CSV import) · `tests/`

## Hard rules
1. **Never rewrite or edit `app/ml/trained/mednerals_ml.py`.** Import its functions (`build_weekly_demand`, `forecast`,
   `build_stockout_snapshots`, `stockout_probability`). Backend code only writes SQL queries that return DataFrames with the
   column names those functions expect (use SQL aliases).
2. **No retraining in the backend.** Load the two `.joblib` artifacts once at startup; inference only. Artifacts are plain dicts.
3. **ML only for demand forecasting and stockout risk.** Supplier statistics, safety stock, reorder point, recommended
   quantity, action and priority are formulas/rules.
4. **Advisory only.** Never place purchase orders automatically. Recommendations need an officer's Accept/Adjust/Reject.
5. **Prediction date = latest Monday on or before the data cutoff** (`cutoff - timedelta(days=cutoff.weekday())`), never "today".
6. **No future data** in any feature: only rows dated on or before the prediction date.
7. **Do not invent columns.** Inspect the CSV headers in `data/MedNeurals_dataset_v2/` before writing models or imports.
8. **The LLM (later phase) only explains stored results.** It never produces forecasts, probabilities, quantities or priorities.
9. Keep it simple: no new frameworks, layers or abstractions unless the plan asks for them. Add only dependencies the phase needs.

## Data conventions
- DB columns are snake_case. Unique keys: `demand.demand_id`; `daily_inventory (date, store_id, item_id)`;
  `purchase_orders.purchase_order_id`; `stock_transfers (transfer_date, to_store_id, item_id)`.
- No FK from `medical_items` to `units_of_measure` (item file stores the unit name, units table is keyed by code).
- Central store is `STR-001`; all other stores are sub-stores. Purchases happen at item level (central store);
  store-level problems are fixed with transfers.
- Big tables (demand 3.5M rows, daily_inventory 2.8M rows): bulk load with COPY / `to_sql(chunksize=10000)`,
  never row-by-row ORM inserts. Re-imports use `ON CONFLICT` on the unique keys.
- Demo: import data up to 2025-11-30; December 2025 is replayed week by week through `POST /data/import`.

## Verification
- After ML integration: for data cutoff 2025-12-29 the backend's forecasts, stockout probabilities and
  recommendations must match the notebook outputs / `app/ml/trained/reorder_recommendations_latest.csv`.
- End every phase by reporting: files changed, migration changes, commands to run, and how to verify manually.

## Commands
- Run API: `uvicorn app.main:app --reload` (docs at http://127.0.0.1:8000/docs)
- Migrations: `alembic revision --autogenerate -m "<name>"`, review it, then `alembic upgrade head`
- Tests: `pytest`
