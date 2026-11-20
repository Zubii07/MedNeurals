from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.core.security import hash_password
from app.database.connection import get_db
from app.models.user import ROLE_ADMIN, User
from app.schemas.auth import UserCreate, UserList, UserOut, UserUpdate

# Every route here is admin-only (the router-level dependency is merged into each route at include time).
router = APIRouter(prefix="/users", tags=["users"], dependencies=[Depends(require_admin)])

DUPLICATE_EMAIL = "An account with this email already exists"


@router.get("", response_model=UserList)
def list_users(db: Session = Depends(get_db)) -> dict:
    return {"items": db.scalars(select(User).order_by(User.name, User.id)).all()}


@router.post("", response_model=UserOut, status_code=201)
def create_user(body: UserCreate, db: Session = Depends(get_db)) -> User:
    user = User(name=body.name.strip(), email=body.email, role=body.role, password_hash=hash_password(body.password), is_active=True)
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail=DUPLICATE_EMAIL) from None
    db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserOut)
def update_user(user_id: int, body: UserUpdate, db: Session = Depends(get_db), current: User = Depends(require_admin)) -> User:
    """Change name, email, role, active flag or password. Guards: you cannot deactivate or demote your own account, and
    the last active administrator cannot be deactivated or demoted (checked in the same transaction as the change)."""
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail=f"User {user_id} not found")
    demote = body.role is not None and body.role != ROLE_ADMIN and target.role == ROLE_ADMIN
    deactivate = body.is_active is False and target.is_active
    if (demote or deactivate) and target.id == current.id:
        raise HTTPException(status_code=400, detail="You cannot deactivate or demote your own account")
    if (demote or deactivate) and target.role == ROLE_ADMIN and target.is_active:
        other_admins = db.scalar(select(func.count()).select_from(User).where(
            User.role == ROLE_ADMIN, User.is_active.is_(True), User.id != target.id))
        if other_admins == 0:
            raise HTTPException(status_code=400, detail="This is the last active administrator; add another administrator first")

    if body.name is not None:
        target.name = body.name.strip()
    if body.email is not None:
        target.email = body.email
    if body.role is not None:
        target.role = body.role
    if body.is_active is not None:
        target.is_active = body.is_active
    if body.password is not None:
        target.password_hash = hash_password(body.password)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail=DUPLICATE_EMAIL) from None
    db.refresh(target)
    return target
