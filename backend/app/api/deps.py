"""Request dependencies for sign-in and roles (Phase 11).

- get_current_user: the signed-in user, from the bearer token; 401 otherwise. Every data router is included with this
  dependency in app/main.py, and tests override it (tests/conftest.py).
- require_admin: chains through get_current_user and answers 403 for any other role, so the test override covers the
  admin routes too.
- require_officer: the same for PROCUREMENT_OFFICER; only officers decide on recommendations (Accept / Adjust / Reject).
"""

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import TokenError, decode_access_token
from app.database.connection import get_db
from app.models.user import ROLE_ADMIN, ROLE_OFFICER, User

bearer = HTTPBearer(auto_error=False)


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(status_code=401, detail=detail, headers={"WWW-Authenticate": "Bearer"})


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _unauthorized("Not signed in")
    try:
        claims = decode_access_token(credentials.credentials)
        user_id = int(claims["sub"])
    except (TokenError, KeyError, ValueError):
        raise _unauthorized("Your session is invalid or has expired; sign in again") from None
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise _unauthorized("This account is no longer active; sign in again")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != ROLE_ADMIN:
        raise HTTPException(status_code=403, detail="Administrators only")
    return user


def require_officer(user: User = Depends(get_current_user)) -> User:
    if user.role != ROLE_OFFICER:
        raise HTTPException(status_code=403, detail="Procurement officers only")
    return user
