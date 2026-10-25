**AI-Based Hospital Procurement Decision-Support System**

Purpose: A buildable, phase-by-phase guide for Claude Agent Mode and VS Code implementation.

| **Current status**         | **Decision**                                                                     |
|----------------------------|----------------------------------------------------------------------------------|
| Project folders            | Created                                                                          |
| Python virtual environment | Created / configured                                                             |
| PostgreSQL                 | Connected                                                                        |
| FastAPI foundation         | Phase 1 completed                                                                |
| ML training                | Completed separately in Google Colab; trained artifacts will be integrated later |

*Design principle: keep the backend simple. PostgreSQL is the source of truth; ML is used only for demand forecasting and stockout risk; other procurement logic stays statistical or rule-based.*

# 1. Backend Scope and Final Data Flow

The backend has five responsibilities: store hospital data, prepare runtime model inputs, run saved ML models, calculate procurement rules/statistics, and expose the latest results to the frontend.

CSV files (current source)  
↓  
Validate + standardize  
↓  
PostgreSQL canonical tables  
↓  
Extract latest required history  
↓  
Runtime preprocessing / feature engineering  
↓  
Saved demand model (.joblib) → demand forecast  
↓  
Saved stockout model (.joblib) → stockout probability  
↓  
Supplier statistics + reorder formulas/rules  
↓  
Save predictions / recommendations in PostgreSQL  
↓  
FastAPI GET endpoints  
↓  
React dashboard  
↓  
LLM explanation (later, read-only explanation layer)

## Key rules

- CSV files are input/import files, not the long-term runtime data source.

- After import, PostgreSQL is the application source of truth.

- Do not retrain models in the backend. Backend only loads saved trained artifacts and performs inference.

- Do not store ML lag/rolling features as permanent business columns unless a later requirement proves necessary.

- Do not let the LLM calculate forecasts, stockout probabilities, reorder quantities, or priorities.

- No automatic purchase-order placement. The system remains advisory and human-in-the-loop.

# 2. Current Dataset Mapping

Assumption: exact CSV column names must be confirmed from the files before models/migrations are finalized. The filenames below define the intended business entities.

| **Folder / CSV**                              | **Role in backend**                 | **Recommended handling**                                                                     |
|-----------------------------------------------|-------------------------------------|----------------------------------------------------------------------------------------------|
| 01_master/calendar.csv                        | Date/calendar reference             | Load to calendar if model/backend needs explicit calendar attributes; otherwise optional.    |
| 01_master/categories.csv                      | Item categories                     | Load to categories.                                                                          |
| 01_master/departments.csv                     | Hospital departments                | Load to departments.                                                                         |
| 01_master/hospital.csv                        | Hospital master                     | Load to hospitals.                                                                           |
| 01_master/item_department_usage.csv           | Item ↔ department relationship      | Load as bridge table.                                                                        |
| 01_master/medical_items.csv                   | Product/item master                 | Load to medical_items.                                                                       |
| 01_master/stores.csv                          | Inventory stores                    | Load to stores.                                                                              |
| 01_master/supplier_items.csv                  | Supplier ↔ item relationship        | Load as bridge table.                                                                        |
| 01_master/suppliers.csv                       | Supplier master                     | Load to suppliers.                                                                           |
| 01_master/units_of_measure.csv                | Units                               | Load to units_of_measure.                                                                    |
| 02_transactions/daily_inventory.csv           | Historical stock snapshots          | Load to daily_inventory.                                                                     |
| 02_transactions/demand.csv                    | Historical demand/consumption       | Load to demand.                                                                              |
| 02_transactions/purchase_orders.csv           | Purchase-order history              | Load to purchase_orders initially; split header/lines only if CSV structure requires it.     |
| 02_transactions/stock_transfers.csv           | Store-to-store transfers            | Load to stock_transfers.                                                                     |
| 02_transactions/stockout_events.csv           | Observed stockout events            | Load to stockout_events.                                                                     |
| 03_model_ready/forecast_weekly_store_item.csv | Training/model-ready forecast frame | Do not use as runtime source of truth. Recreate equivalent features from PostgreSQL.         |
| 03_model_ready/lead_time_orders.csv           | Derived supplier/lead-time frame    | Do not require as permanent runtime table; calculate from transactional data where possible. |
| 03_model_ready/stockout_weekly_snapshots.csv  | Training/model-ready stockout frame | Do not use as runtime source of truth. Recreate equivalent features from PostgreSQL.         |

# 3. Database Tables

Create the schema in two migrations: first the operational/source tables, then the model-result tables. This makes debugging easier.

## 3.1 Core operational tables - Migration A

| **Table**             | **Primary key**          | **Important foreign keys / notes**                                                                                                                                                                                                                                  |
|-----------------------|--------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| hospitals             | hospital_id              | Hospital name/code; one hospital is enough for current scope.                                                                                                                                                                                                       |
| categories            | category_id              | Category master.                                                                                                                                                                                                                                                    |
| departments           | department_id            | hospital_id → hospitals.                                                                                                                                                                                                                                            |
| stores                | store_id                 | hospital_id → hospitals; store type if available.                                                                                                                                                                                                                   |
| units_of_measure      | uom_id                   | Unit master.                                                                                                                                                                                                                                                        |
| medical_items         | item_id                  | category_id → categories. No FK to units_of_measure: the item file stores the unit NAME (e.g. "Box") while units_of_measure is keyed by CODE ("BOX"); keep uom as a plain text column.                                                                              |
| suppliers             | supplier_id              | Supplier master.                                                                                                                                                                                                                                                    |
| supplier_items        | composite / surrogate id | supplier_id → suppliers; item_id → medical_items; unique supplier+item.                                                                                                                                                                                             |
| item_department_usage | composite / surrogate id | item_id → medical_items; department_id → departments; unique item+department.                                                                                                                                                                                       |
| calendar              | date                     | Optional if calendar attributes are used outside ML.                                                                                                                                                                                                                |
| demand                | id                       | item_id → medical_items; store_id → stores; department_id → departments; demand_date, demand_quantity. Unique: demand_id (from Demand_ID).                                                                                                                          |
| daily_inventory       | id                       | item_id → medical_items; store_id → stores; same columns as daily_inventory.csv: date, opening_qty, received_qty, demand_qty, issued_qty, unmet_qty, closing_qty, on_order_qty, is_stockout. Unique: (date, store_id, item_id).                                     |
| purchase_orders       | row/line id              | supplier_id → suppliers; item_id → medical_items; one row per PO line as in purchase_orders.csv (order/expected/receipt dates, ordered/accepted qty, lead_time_days, is_emergency, status). Unique: purchase_order_id (upsert on re-import because status changes). |
| stock_transfers       | transfer_id              | item_id → medical_items; from_store_id/to_store_id → stores. Unique: (transfer_date, to_store_id, item_id).                                                                                                                                                         |
| stockout_events       | event_id                 | item_id → medical_items; store_id → stores; start/end dates as available.                                                                                                                                                                                           |
| uploads               | id                       | Tracks source filename, dataset type, rows accepted/rejected, timestamp, status.                                                                                                                                                                                    |

**Important:** preserve historical inventory and demand rows. Do not overwrite old snapshots. Add indexes on common date/item/store query combinations.

**Column naming:** DB columns are snake_case (store_id, item_id, demand_date …). mednerals_ml.py expects the original CSV column names (e.g. Demand_Date, Store_ID, Item_ID, Demand_Quantity for demand; the daily_inventory.csv names for inventory). The feature queries in Phase 5 rename columns with SQL aliases, so the DB stays clean and the ML code stays untouched.

**Unique keys:** every transaction table has a natural unique key (listed above). Imports use INSERT … ON CONFLICT DO NOTHING (DO UPDATE for purchase_orders), so re-importing the same file never creates duplicates.

## 3.2 Model and decision tables - Migration B

| **Table**              | **Purpose**                                                                                                                                                  | **Essential fields**                                                                                                                                                                                                                                                                                                                                                                                      |
|------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| model_runs             | Trace every prediction refresh to a model/version and data cutoff.                                                                                           | id, model_type, model_name, model_version, feature_version, data_cutoff_date, started_at, completed_at, status                                                                                                                                                                                                                                                                                            |
| forecast_predictions   | Store demand forecasts.                                                                                                                                      | id, model_run_id, item_id, store_id, prediction_date (week_start), horizon (1–4 weeks), target_week, p50, p90 (both required – safety stock uses P90), created_at                                                                                                                                                                                                                                         |
| stockout_predictions   | Store stockout probabilities/risk.                                                                                                                           | id, model_run_id, item_id, store_id, prediction_date, horizon_days, probability, risk_level, threshold_used, created_at                                                                                                                                                                                                                                                                                   |
| recommendations        | Store rule/formula procurement decision output. PURCHASE rows are per item (the central store buys for the whole hospital); TRANSFER rows are per sub-store. | id, model_run_id, prediction_date, item_id, supplier_id, store_id (TRANSFER rows only), action (PURCHASE / TRANSFER / EXPEDITE_PO / NONE), forecast_p50, current_stock (central), inventory_position (stock + on order), stockout_probability (max over stores), lead_time, safety_stock, reorder_point, recommended_quantity, transfer_qty, priority (HIGH / MODERATE / LOW), reason, status, created_at |
| recommendation_actions | Store officer Accept/Adjust/Reject.                                                                                                                          | id, recommendation_id, user_id, action, original_quantity, adjusted_quantity, comment, created_at                                                                                                                                                                                                                                                                                                         |
| users                  | Minimal application users.                                                                                                                                   | id, name, email, password_hash, role, is_active, created_at                                                                                                                                                                                                                                                                                                                                               |

## 3.3 What should not be stored as permanent DB columns

- lag_1, lag_2, rolling_mean, rolling_std, month_sin, month_cos and other temporary ML features;

- SHAP matrices for every historical row unless there is a later reporting requirement;

- raw duplicate copies of every CSV table in separate staging schemas for the first version;

- LLM-generated numbers or decisions.

# 4. Necessary Data Pipeline

## 4.1 Initial import

01_master + 02_transactions CSV files  
↓  
Read with pandas  
↓  
Validate required columns / data types / keys  
↓  
Standardize dates, IDs and quantities  
↓  
Reject/report invalid rows  
↓  
Insert canonical rows into PostgreSQL

## 4.2 New data import

New hospital CSV/export  
↓  
POST /data/import  
↓  
Validate + standardize  
↓  
Insert only new/changed records  
↓  
PostgreSQL updated  
↓  
Refresh predictions (manual endpoint initially; can be called automatically after successful import later)

**Demo data:** import the dataset only up to 2025-11-30 and split December 2025 into four weekly CSV files. In the demo, upload one week through POST /data/import, call POST /predictions/refresh, and the dashboard shows new predictions – a 'live' system without any extra endpoint.

## 4.3 Runtime prediction preprocessing

There are two different preprocessing responsibilities. Keep them separate.

| **Type**                               | **Purpose**                                                                       | **Examples**                                                                                                                                       |
|----------------------------------------|-----------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------|
| Import preprocessing                   | Make raw hospital data safe and consistent before DB insertion.                   | Column mapping, date parsing, required fields, duplicate checks, ID validation, invalid quantity checks.                                           |
| Model preprocessing / feature building | Convert canonical DB records into the exact inputs expected by the trained model. | Weekly aggregation, lag features, rolling means/std, seasonality, current stock, days of cover, supplier lead time, open PO/in-transit quantities. |

**Critical rule:** the backend must use exactly the feature definitions used during training. Do this by importing the functions in mednerals_ml.py (shipped with the .joblib files) – never by rewriting them. Never use future information at inference time.

## 4.4 Demand → stockout dependency

PostgreSQL demand history  
↓  
Demand feature builder  
↓  
demand_forecast_pipeline.joblib  
↓  
Forecasted demand  
↓  
Combine with current inventory + supplier lead time + open PO/transit + recent demand  
↓  
Stockout feature builder  
↓  
stockout_pipeline.joblib  
↓  
Stockout probability / risk level

# 5. Minimum API Design

Do not build full CRUD for every table. The first version mainly needs import, refresh, read, and officer-action endpoints.

| **Endpoint**                      | **Purpose**                                                                | **Returns**                                                                                                                                                     |
|-----------------------------------|----------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| POST /data/import                 | Import one supported CSV dataset into PostgreSQL.                          | dataset type, filename, rows accepted/rejected, errors, import timestamp                                                                                        |
| POST /predictions/refresh         | Build latest model inputs from DB, run saved models, and save new results. | status, model versions, data cutoff, completed timestamp, counts generated                                                                                      |
| GET /predictions/status           | Show when predictions were last refreshed.                                 | latest model run/version, data cutoff, status, timestamp                                                                                                        |
| GET /products                     | List medical items for dashboard/search.                                   | item id/code, name, category, unit, active flag                                                                                                                 |
| GET /products/{id}                | Return basic item details.                                                 | item master fields                                                                                                                                              |
| GET /products/{id}/analysis       | Return one combined procurement decision view.                             | current stock, forecast (P50/P90), stockout probability/risk, lead time, open/incoming stock, reorder point, suggested quantity, action, priority, last updated |
| GET /forecasts                    | Return latest forecast rows, filterable by item/store.                     | item/store, horizon, forecast quantity, model version, timestamp                                                                                                |
| GET /stockout-risks               | Return latest stockout predictions.                                        | item/store, probability, risk level, horizon, model version, timestamp                                                                                          |
| GET /dashboard/summary            | Populate dashboard cards and latest-risk table.                            | counts by risk/priority, latest data/prediction timestamp, items needing attention                                                                              |
| GET /suppliers/{id}/performance   | Return statistical supplier performance.                                   | avg/median lead time, variability, on-time rate, fill rate                                                                                                      |
| GET /recommendations              | List latest recommendations.                                               | item (and store for transfers), action, priority, quantity, status                                                                                              |
| POST /recommendations/{id}/action | Accept, adjust, or reject a recommendation.                                | saved action/status and adjusted quantity if applicable                                                                                                         |
| POST /assistant/query             | Later: explain already-computed results in plain language.                 | grounded natural-language answer                                                                                                                                |

# 6. Frontend Data Flow

Use simple refresh-on-load plus optional polling. WebSockets are unnecessary for the first procurement dashboard.

Dashboard opens  
↓  
GET /dashboard/summary  
GET /stockout-risks (latest)  
↓  
Render latest saved DB results  
↓  
Optional poll every 3–5 minutes  
↓  
After successful data import or prediction refresh, frontend re-fetches immediately

## Product analysis view - most important fields

| **Field**                         | **Why it matters**                                                                                                                                                             |
|-----------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Current stock                     | Immediate inventory position.                                                                                                                                                  |
| Demand forecast                   | Expected upcoming usage for selected horizon.                                                                                                                                  |
| Stockout probability / risk level | Early-warning indicator from ML.                                                                                                                                               |
| Supplier average lead time        | How long replenishment normally takes.                                                                                                                                         |
| Open / incoming quantity          | Avoids recommending excess stock when a PO is already in transit.                                                                                                              |
| Reorder point                     | Rule/formula threshold for action.                                                                                                                                             |
| Suggested reorder quantity        | Decision-support quantity, not an automatic PO.                                                                                                                                |
| Priority (timing label)           | HIGH / MODERATE / LOW from deterministic rules. The NOW / SOON / NO ACTION label is derived from priority (HIGH → NOW, MODERATE → SOON, LOW → NO ACTION), not a separate rule. |
| Last updated                      | Shows freshness of data and predictions.                                                                                                                                       |

# 7. Implementation Phases

Complete each phase, test it, then move to the next. Do not allow Claude Agent Mode to implement later phases early.

| **Phase**                                                                 | **Work**                                                                                                                                                                                                                                                                                                                                          | **Exit condition**                                                                                                                                                                                                                 |
|---------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Phase 1 - Foundation (DONE)                                               | FastAPI app, environment config, PostgreSQL connection, SQLAlchemy base, health endpoints, Alembic setup.                                                                                                                                                                                                                                         | Backend starts and DB health check passes.                                                                                                                                                                                         |
| Phase 2 - Core Database Schema                                            | Create SQLAlchemy models for master/transaction tables and uploads. Add relationships, indexes, the natural unique keys from section 3.1 (no FK from medical_items to units_of_measure), then generate Migration A.                                                                                                                               | Tables exist in PostgreSQL and match CSV business entities.                                                                                                                                                                        |
| Phase 3 - CSV Import & Validation                                         | Implement file-specific import mapping/validation for 01_master and 02_transactions. Validate in pandas, then BULK load (PostgreSQL COPY or to_sql in chunks of 10,000) – demand (3.5M rows) and daily_inventory (2.8M rows) cannot be inserted row by row. Use ON CONFLICT for re-imports. Import in dependency order. Track imports in uploads. | Current CSV dataset is inside PostgreSQL with referential integrity and row-count checks.                                                                                                                                          |
| Phase 4 - Core Read/Data Verification APIs                                | Add products, inventory/current stock, demand history, PO, and supplier read queries needed for verification.                                                                                                                                                                                                                                     | Can verify DB content through Swagger/API without opening CSV files.                                                                                                                                                               |
| Phase 5 - Runtime Data Queries (feature code reused from mednerals_ml.py) | Do NOT write new feature code. Copy mednerals_ml.py unchanged into app/ml/trained/ and write only the SQL queries that return DataFrames with the column names its functions expect (SQL aliases for renaming).                                                                                                                                   | Query DataFrames pass through build_weekly_demand / build_stockout_snapshots without errors; no future rows are read beyond the cutoff.                                                                                            |
| Phase 6 - ML Artifact Integration                                         | Place final joblib artifacts next to mednerals_ml.py in backend/app/ml/trained, load once at startup, call forecast() first, then pass its output into build_stockout_snapshots() and stockout_probability().                                                                                                                                     | Backend output for cutoff 2025-12-29 matches the notebook's predictions and reorder_recommendations_latest.csv.                                                                                                                    |
| Phase 7 - Model Runs & Prediction Persistence                             | Create Migration B for model_runs, forecast_predictions, stockout_predictions. Implement prediction refresh and save versioned results.                                                                                                                                                                                                           | Every saved prediction is traceable to model/version/data cutoff. prediction_date = the data cutoff if it is a Sunday, otherwise the latest Monday on or before it (forecasts need complete weeks; the stockout model was trained on Monday end-of-day snapshots and scores almost the same on Sunday snapshots). |
| Phase 8 - Supplier Statistics                                             | Calculate lead time, variability, on-time rate and fill rate from transactional data. No ML.                                                                                                                                                                                                                                                      | Supplier metrics available through service/API.                                                                                                                                                                                    |
| Phase 9 - Recommendation Engine                                           | Calculate safety stock (z per VED class: V 2.05 / E 1.65 / D 1.28), reorder point, inventory position, suggested quantity (rounded to pack size and MOQ), action (PURCHASE / TRANSFER / EXPEDITE_PO / NONE) and priority from forecasts, risk, stock, pending orders and lead time.                                                               | Recommendations saved with deterministic inputs and reasons.                                                                                                                                                                       |
| Phase 10 - Dashboard APIs                                                 | Build dashboard summary, forecasts, stockout risks, recommendations and combined product analysis endpoint.                                                                                                                                                                                                                                       | React frontend can work entirely from FastAPI responses.                                                                                                                                                                           |
| Phase 11 - Authentication & Officer Actions                               | Minimal ADMIN and PROCUREMENT_OFFICER login; protect mutation endpoints; Accept/Adjust/Reject recommendation actions.                                                                                                                                                                                                                             | Human-in-loop workflow works and actions are recorded.                                                                                                                                                                             |
| Phase 12 - LLM Explanation Layer                                          | Assistant reads only structured DB/model/recommendation results and explains them. No raw decision-making.                                                                                                                                                                                                                                        | Plain-language grounded explanation endpoint.                                                                                                                                                                                      |
| Phase 13 - Tests & Final Integration                                      | Unit tests for formulas/features; API tests; import duplicate/error tests; model input/output tests; frontend integration.                                                                                                                                                                                                                        | Stable end-to-end CSV → DB → model → DB → API → frontend flow.                                                                                                                                                                     |

# 8. Immediate Next Work: Phase 2

This is what should be implemented now. Do not start CSV ingestion or ML integration until these checks pass.

1.  Inspect the real CSV headers and infer exact IDs/relationships. Do not invent columns.

2.  Create SQLAlchemy models for hospitals, categories, departments, stores, units_of_measure, medical_items, suppliers, supplier_items, item_department_usage, demand, daily_inventory, purchase_orders, stock_transfers, stockout_events, and uploads.

3.  Add primary keys, foreign keys, the natural unique keys from section 3.1 and date/item/store indexes. Do not add a foreign key from medical_items to units_of_measure.

4.  Use snake_case DB column names; record the mapping to the original CSV names (needed later by the Phase 5 feature queries).

5.  Import all model modules into the SQLAlchemy metadata used by Alembic.

6.  Generate one Alembic migration named create_core_tables.

7.  Review the generated migration before applying it.

8.  Run alembic upgrade head.

9.  Verify all tables and foreign keys in pgAdmin.

10. Do not create prediction/recommendation tables yet; those belong to Migration B after runtime feature/model integration is ready.

# 9. CSV Import Order

Foreign keys make import order important. Use this order for the initial dataset load:

1\. hospital.csv  
2. categories.csv  
3. units_of_measure.csv  
4. departments.csv  
5. stores.csv  
6. medical_items.csv  
7. suppliers.csv  
8. supplier_items.csv  
9. item_department_usage.csv  
10. calendar.csv (if used)  
11. demand.csv  
12. daily_inventory.csv  
13. purchase_orders.csv  
14. stock_transfers.csv  
15. stockout_events.csv

The 03_model_ready files should remain training/reference artifacts. Runtime feature builders should recreate their required inputs from PostgreSQL rather than inserting those files as the primary operational source.

# 10. Quality Gates Before Each Phase

| **Area**               | **Minimum check**                                                                                                                                                                                          |
|------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Database               | Foreign keys valid; expected row counts; no accidental duplicate imports; historical rows preserved.                                                                                                       |
| Import                 | Rejected rows are reported; invalid rows are not silently dropped; dates/quantities parsed correctly.                                                                                                      |
| Feature building       | Features come only from mednerals_ml.py (never re-implemented); exact columns expected by the saved model; no future leakage; prediction_date is a Monday, or the cutoff Sunday; outputs match the notebook for the same cutoff. |
| ML inference           | Artifact loads; prediction shape/range valid; demand forecast generated before stockout features that depend on it.                                                                                        |
| Prediction persistence | model_run_id/version/data cutoff recorded; latest results query is deterministic.                                                                                                                          |
| Recommendations        | Formula outputs reproducible; pending/transit stock included; no negative suggested quantity.                                                                                                              |
| Frontend API           | Latest results returned with last_updated/model_version; no frontend direct DB/model access.                                                                                                               |
| LLM                    | Receives structured facts only; never changes calculated numbers.                                                                                                                                          |

# 11. How to Use This Document With Claude Agent Mode

Give Claude the repository plus this document. Ask it to implement one phase at a time. For every phase, require it to inspect the existing code before editing and to preserve previously working behavior.

Agent instruction template  
  
Implement only Phase \<N\> from the attached Backend Implementation Plan.  
  
Rules:  
- Inspect the existing repository first.  
- Do not implement future phases.  
- Keep the code simple and readable; no unnecessary abstractions.  
- Reuse the existing FastAPI/SQLAlchemy/Alembic setup.  
- Do not rename working folders/files without need.  
- Do not invent dataset columns; inspect the CSV headers first.  
- Add only dependencies actually needed for this phase.  
- Run relevant checks/tests after changes.  
- At the end, report: files changed, DB/migration changes, commands to run, and how I can verify the phase manually.

# 12. Ready-to-Use Claude Prompts for the Next Phases

## Phase 2 prompt - Core database schema

Implement Phase 2: Core Database Schema from the attached plan.  
Inspect the CSV headers in 01_master and 02_transactions first. Create only the SQLAlchemy models and relationships needed for those files plus uploads. Use snake_case column names. Add primary keys, foreign keys, indexes and these unique keys: demand.demand_id; daily_inventory (date, store_id, item_id); purchase_orders.purchase_order_id; stock_transfers (transfer_date, to_store_id, item_id). Do NOT add a foreign key from medical_items to units_of_measure (the item file stores the unit name, the units table is keyed by code). Configure Alembic metadata correctly, generate the core-tables migration, and show me how to apply and verify it. Do not import CSV data yet. Do not add prediction, recommendation, ML, frontend or LLM logic.

## Phase 3 prompt - CSV import

Implement Phase 3: CSV Import & Validation from the attached plan.  
Use the actual files/columns in 01_master and 02_transactions. Build simple reusable import functions using pandas + SQLAlchemy. Validate required columns, IDs, dates, duplicates and quantities in pandas; report rejected rows instead of silently dropping them. Then BULK load: use PostgreSQL COPY (or DataFrame.to_sql with method='multi', chunksize=10000) – never insert row by row, because demand has 3.5M rows and daily_inventory 2.8M. Use INSERT … ON CONFLICT on the unique keys so re-importing a file creates no duplicates (DO UPDATE for purchase_orders). Add an option to import only rows up to a cutoff date (default: all; demo: 2025-11-30). Import in foreign-key-safe order and track each import in uploads. Do not use 03_model_ready as the runtime source of truth. Do not add ML yet.

## Phase 5–6 prompt - Runtime ML integration

Implement Phases 5–6. Do NOT write new feature-engineering code. Copy mednerals_ml.py and the two .joblib files into app/ml/trained/ unchanged and import build_weekly_demand, forecast, build_stockout_snapshots and stockout_probability from it. Your job is only: (1) SQL queries that return pandas DataFrames with exactly the column names these functions expect (demand: Demand_Date, Store_ID, Item_ID, Demand_Quantity; inventory: the daily_inventory.csv columns; transfers, purchase orders and supplier items: their CSV columns), using SQL aliases where DB column names differ; (2) loading the artifacts once at startup; (3) running forecast() first, then build_stockout_snapshots() with that forecast, then stockout_probability(). Use the latest Monday on or before the data cutoff as the prediction date. Verify: for a data cutoff of 2025-12-29, outputs must match reorder_recommendations_latest.csv and the notebook's predictions. No retraining. No future-data leakage.

# 13. Definition of Done for the Backend

The backend is complete when this path works without reading model-ready CSV files at runtime:

Hospital CSV/export  
↓  
Validated canonical PostgreSQL data  
↓  
Runtime feature builders  
↓  
Saved demand model  
↓  
Demand forecast  
↓  
Saved stockout model  
↓  
Stockout risk  
↓  
Supplier statistics + reorder rules  
↓  
Versioned predictions / recommendations in PostgreSQL  
↓  
FastAPI latest-result endpoints  
↓  
React procurement dashboard  
↓  
Officer Accept / Adjust / Reject  
↓  
LLM explains existing results only

Do not add extra infrastructure unless a real requirement appears. The first version should remain understandable enough that every data field can be traced from CSV → DB → preprocessing → model/rule → stored result → frontend.
