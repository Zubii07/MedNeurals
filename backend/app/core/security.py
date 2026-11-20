"""Password hashing (bcrypt) and signed access tokens (PyJWT) for Phase 11 sign-in.

A token carries the user id (`sub`), the role at issue time (for display only: authorisation re-reads the users row on
every request, see app/api/deps.py) and an expiry from settings.access_token_expire_minutes.
"""

import datetime

import bcrypt
import jwt

from app.core.config import settings

MAX_PASSWORD_BYTES = 72   # bcrypt's input limit; bcrypt 5 raises on longer input instead of truncating


class TokenError(Exception):
    """The token is missing, malformed, badly signed or expired."""


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("ascii")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("ascii"))
    except ValueError:      # over 72 bytes, or an unreadable hash: never a 500, just "no"
        return False


def create_access_token(user, expires_minutes: int | None = None) -> str:
    """Signed JWT for `user` (anything with .id and .role). `expires_minutes` overrides the setting (tests)."""
    now = datetime.datetime.now(datetime.timezone.utc)
    minutes = settings.access_token_expire_minutes if expires_minutes is None else expires_minutes
    payload = {"sub": str(user.id), "role": user.role, "iat": now, "exp": now + datetime.timedelta(minutes=minutes)}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict:
    """The token's claims, or TokenError. Signature and expiry are checked by PyJWT."""
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError as exc:
        raise TokenError(str(exc)) from exc
