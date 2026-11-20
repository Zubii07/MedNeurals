import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base

ROLE_ADMIN = "ADMIN"
ROLE_OFFICER = "PROCUREMENT_OFFICER"
ROLES = (ROLE_ADMIN, ROLE_OFFICER)


class User(Base):
    """Application users (BACKEND_PLAN §3, Phase 11). Two roles: ADMIN manages accounts and runs imports, refreshes
    and recommendation generation; PROCUREMENT_OFFICER reads everything. Accounts are deactivated, never deleted."""

    __tablename__ = "users"
    __table_args__ = (CheckConstraint(f"role IN ('{ROLE_ADMIN}', '{ROLE_OFFICER}')", name="role"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)   # stored lowercase
    password_hash: Mapped[str] = mapped_column(String(100))                    # bcrypt
    role: Mapped[str] = mapped_column(String(30))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_login_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(timezone=True))
