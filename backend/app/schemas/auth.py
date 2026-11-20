import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.security import MAX_PASSWORD_BYTES

Role = Literal["ADMIN", "PROCUREMENT_OFFICER"]
MIN_PASSWORD_LENGTH = 8


def normalise_email(value: str) -> str:
    """Lowercase, trimmed, and shaped like an address. (No email-validator dependency: a sign-in id, not mail.)"""
    email = (value or "").strip().lower()
    local, sep, domain = email.partition("@")
    if not sep or not local or not domain or " " in email:
        raise ValueError("enter a valid email address")
    return email


def check_password(value: str) -> str:
    if len(value) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"password must be at least {MIN_PASSWORD_LENGTH} characters")
    if len(value.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise ValueError(f"password must be at most {MAX_PASSWORD_BYTES} bytes")
    return value


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    role: Role
    is_active: bool
    created_at: datetime.datetime
    last_login_at: datetime.datetime | None


class UserList(BaseModel):
    items: list[UserOut]


class LoginRequest(BaseModel):
    email: str = Field(max_length=255)
    password: str = Field(min_length=1, max_length=255)   # length is checked by verify_password, never a 500

    @field_validator("email")
    @classmethod
    def _email(cls, value: str) -> str:
        return normalise_email(value)


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in_minutes: int
    user: UserOut


class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(max_length=255)
    role: Role
    password: str

    @field_validator("email")
    @classmethod
    def _email(cls, value: str) -> str:
        return normalise_email(value)

    @field_validator("password")
    @classmethod
    def _password(cls, value: str) -> str:
        return check_password(value)


class UserUpdate(BaseModel):
    """Any subset of fields; a missing field is left as it is. `password` sets a new password."""
    name: str | None = Field(default=None, min_length=1, max_length=100)
    email: str | None = Field(default=None, max_length=255)
    role: Role | None = None
    is_active: bool | None = None
    password: str | None = None

    @field_validator("email")
    @classmethod
    def _email(cls, value: str | None) -> str | None:
        return None if value is None else normalise_email(value)

    @field_validator("password")
    @classmethod
    def _password(cls, value: str | None) -> str | None:
        return None if value is None else check_password(value)
