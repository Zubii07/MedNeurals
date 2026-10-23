# MedNeurals

AI-assisted hospital procurement decision-support system for forecasting demand, identifying stockout risk, analyzing supplier performance, and generating procurement recommendations.

## Project Status

Initial backend setup in progress.

## Core Architecture

```text
Hospital Data / CSV
        ↓
PostgreSQL
        ↓
Python Data Extraction
        ↓
Preprocessing / Feature Building
        ↓
Saved ML Models
   ├── Demand Forecasting
   └── Stockout Risk
        ↓
Statistical / Rule-Based Logic
   ├── Supplier Analysis
   ├── Safety Stock
   ├── Reorder Point
   └── Recommended Quantity / Priority
        ↓
FastAPI Backend
        ↓
React Frontend
        ↓
Procurement Officer
Accept / Adjust / Reject
```

The LLM is used only to explain existing predictions, recommendations, and insights in plain language. It does not calculate forecasts, stockout probabilities, reorder quantities, or priorities.

## Technology Stack

### Backend
- Python
- FastAPI
- SQLAlchemy
- Alembic
- Pydantic
- JWT authentication

### Database
- PostgreSQL

### Machine Learning
- scikit-learn
- XGBoost
- LightGBM
- joblib

### Frontend
- React

### Data Processing
- pandas
- NumPy

## ML Scope

Machine learning is used only where necessary.

### ML-based
- Demand forecasting
- Stockout risk prediction

### Statistical / Rule-based
- Supplier lead-time analysis
- Supplier performance
- Safety stock
- Reorder point
- Recommended quantity
- Priority assignment

## Project Structure

```text
hospital-procurement-system/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── services/
│   │   ├── ml/
│   │   │   └── trained/
│   │   ├── database/
│   │   ├── core/
│   │   └── main.py
│   ├── tests/
│   ├── requirements.txt
│   └── .env
│
├── frontend/
├── data/
│   ├── raw/
│   ├── processed/
│   └── sample/
│
├── .gitignore
└── README.md
```

## Backend Setup

### 1. Create and activate virtual environment

From the `backend` directory:

```bash
python -m venv .venv
```

Windows:

```bash
.venv\Scripts\activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. PostgreSQL

Create a PostgreSQL database named:

```text
MedNeurals
```

Example local connection settings:

```text
Host: localhost
Port: 5432
Database: MedNeurals
Username: postgres
```

### 4. Environment Variables

Create:

```text
backend/.env
```

Example:

```env
DATABASE_URL=postgresql+psycopg://postgres:YOUR_PASSWORD@localhost:5432/MedNeurals
JWT_SECRET=YOUR_SECRET_KEY
JWT_ALGORITHM=HS256
LLM_API_KEY=YOUR_API_KEY
```

Never commit `.env` to Git.

### Phase 1 backend checks

From the `backend` directory, start the API:

```bash
uvicorn app.main:app --reload
```

Then check:

- `GET http://127.0.0.1:8000/health` returns `{"status":"ok"}`.
- `GET http://127.0.0.1:8000/health/db` returns a connected status when PostgreSQL is available.

Alembic uses the same `DATABASE_URL` from `.env`. With no business models yet, there are no migrations to generate:

```bash
alembic current
alembic check
```

## Model Artifacts

Final trained models from Google Colab will be placed in:

```text
backend/app/ml/trained/
```

Expected artifacts:

```text
demand_forecast_pipeline.joblib
stockout_pipeline.joblib
```

The backend loads these models for inference only. Model training is performed separately in Google Colab.

## Planned Backend Modules

- Authentication
- Products
- Departments
- Stores
- Suppliers
- Consumption
- Inventory
- Purchase Orders
- Stock Receipts
- CSV/Data Import
- ML Prediction
- Supplier Analysis
- Recommendation Engine
- Dashboard
- LLM Assistant


## Important Design Rules

- Do not retrain models during normal backend requests.
- Do not use future information during prediction.
- Do not let the LLM make procurement decisions.
- Do not automatically place purchase orders.
- Keep the system advisory and human-in-the-loop.
- Procurement officers must be able to accept, adjust, or reject recommendations.

## Development Plan

1. Backend foundation
2. PostgreSQL connection
3. SQLAlchemy models and Alembic migrations
4. Authentication
5. Hospital data import and validation
6. Core read APIs
7. Supplier statistics
8. ML model integration
9. Recommendation engine
10. Dashboard APIs
11. LLM explanation layer
12. Testing and deployment

## License

For academic / Final Year Project use.

