from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.api.auth import router as auth_router
from app.api.dashboard import router as dashboard_router
from app.api.data_import import router as data_import_router
from app.api.deps import get_current_user
from app.api.predictions import router as predictions_router
from app.api.reads import router as reads_router
from app.api.recommendations import router as recommendations_router
from app.api.suppliers import router as suppliers_router
from app.api.users import router as users_router
from app.database.connection import engine
from app.ml.artifacts import get_artifacts


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_artifacts()  # load the trained models once; every prediction run reuses them
    yield


app = FastAPI(title="MedNeurals API", lifespan=lifespan)

# Phase 11: every data router needs a signed-in user (the dependency is merged into each of its routes); admin-only
# routes add require_admin on their own decorators. /auth/login and the two health checks stay public.
SIGNED_IN = [Depends(get_current_user)]
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(data_import_router, dependencies=SIGNED_IN)
app.include_router(reads_router, dependencies=SIGNED_IN)
app.include_router(predictions_router, dependencies=SIGNED_IN)
app.include_router(suppliers_router, dependencies=SIGNED_IN)
app.include_router(recommendations_router, dependencies=SIGNED_IN)
app.include_router(dashboard_router, dependencies=SIGNED_IN)


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
