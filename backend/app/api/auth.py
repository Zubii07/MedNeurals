import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.security import create_access_token, verify_password
from app.database.connection import get_db
from app.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])

BAD_CREDENTIALS = "Email or password is incorrect"


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    """Sign in with email and password. One generic message for an unknown email and a wrong password; a deactivated
    account is told so. Returns a bearer token (settings.access_token_expire_minutes) and the user."""
    user = db.scalar(select(User).where(User.email == body.email))
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail=BAD_CREDENTIALS, headers={"WWW-Authenticate": "Bearer"})
    if not user.is_active:
        raise HTTPException(status_code=401, detail="This account has been deactivated", headers={"WWW-Authenticate": "Bearer"})
    user.last_login_at = datetime.datetime.now(datetime.timezone.utc)   # the only place this is written
    db.commit()
    db.refresh(user)
    return TokenResponse(access_token=create_access_token(user), expires_in_minutes=settings.access_token_expire_minutes,
                         user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    """The signed-in user (the frontend calls this on load to confirm a stored token still works)."""
    return user
