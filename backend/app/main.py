from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.api.data_import import router as data_import_router
from app.api.predictions import router as predictions_router
from app.api.reads import router as reads_router
from app.api.recommendations import router as recommendations_router
from app.api.suppliers import router as suppliers_router
from app.database.connection import engine
from app.ml.artifacts import get_artifacts


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_artifacts()  # load the trained models once; every prediction run reuses them
    yield


app = FastAPI(title="MedNeurals API", lifespan=lifespan)
app.include_router(data_import_router)
app.include_router(reads_router)
app.include_router(predictions_router)
app.include_router(suppliers_router)
app.include_router(recommendations_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/health/db")
def database_health() -> dict[str, str]:
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503,
            detail="Database connection failed",
        ) from exc

    return {"status": "ok", "database": "connected"}
