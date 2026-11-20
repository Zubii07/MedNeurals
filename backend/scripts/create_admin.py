"""Create the first administrator, or reset an administrator's password.

Run from backend/ with the project's environment:  python -m scripts.create_admin
Prompts for name, email and password (typed twice, not echoed). If the email exists, that account becomes an active
administrator with the new password; otherwise a new administrator is created. Prints nothing secret.
"""

import getpass
import sys

from sqlalchemy import select

from app.core.security import hash_password
from app.database.connection import SessionLocal
from app.models.user import ROLE_ADMIN, User
from app.schemas.auth import check_password, normalise_email


def main() -> int:
    name = input("Name: ").strip()
    try:
        email = normalise_email(input("Email: "))
    except ValueError as exc:
        print(f"error: {exc}")
        return 1
    password = getpass.getpass("Password (at least 8 characters): ")
    if password != getpass.getpass("Repeat password: "):
        print("error: the passwords do not match")
        return 1
    try:
        check_password(password)
    except ValueError as exc:
        print(f"error: {exc}")
        return 1

    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            if not name:
                print("error: a name is required for a new account")
                return 1
            db.add(User(name=name, email=email, role=ROLE_ADMIN, password_hash=hash_password(password), is_active=True))
            action = "created"
        else:
            user.name = name or user.name
            user.role = ROLE_ADMIN
            user.is_active = True
            user.password_hash = hash_password(password)
            action = "updated"
        db.commit()
    print(f"Administrator {action}: {email}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
