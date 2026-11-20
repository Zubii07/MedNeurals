# Phase 11: sign-in and roles against the real PostgreSQL DB with the real bearer-token check (marker `real_auth`
# switches off the fake admin from conftest.py). Users created here carry a recognisable email prefix and are deleted
# afterwards; no other rows are touched.

import io
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from app.core.security import create_access_token, hash_password
from app.database.connection import SessionLocal, engine
from app.main import app
from app.models.user import ROLE_ADMIN, ROLE_OFFICER, User

PREFIX = "test-auth-"
PASSWORD = "correct horse battery"


def _db_ready() -> bool:
    try:
        with engine.connect() as conn:
            return conn.execute(text("SELECT to_regclass('users') IS NOT NULL")).scalar()
    except OperationalError:
        return False


pytestmark = [pytest.mark.real_auth, pytest.mark.skipif(not _db_ready(), reason="needs PostgreSQL with the users table")]


@pytest.fixture
def make_user():
    """Creates users for one test; deletes every test user afterwards."""
    def make(role=ROLE_OFFICER, active=True, password=PASSWORD, email=None, name=None):
        with SessionLocal() as db:
            user = User(name=name or f"Test {role.title()}", email=email or f"{PREFIX}{uuid.uuid4().hex[:10]}@example.test",
                        password_hash=hash_password(password), role=role, is_active=active)
            db.add(user)
            db.commit()
            db.refresh(user)
            db.expunge(user)
            return user
    yield make
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM users WHERE email LIKE :p"), {"p": f"{PREFIX}%"})


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def login(client, email, password=PASSWORD):
    return client.post("/auth/login", json={"email": email, "password": password})


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_login_returns_a_token_and_the_user(client, make_user):
    admin = make_user(ROLE_ADMIN, name="Ayesha Admin")
    response = login(client, admin.email.upper())          # email is case-insensitive
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["token_type"] == "bearer" and body["expires_in_minutes"] > 0
    assert body["user"]["email"] == admin.email and body["user"]["role"] == ROLE_ADMIN and body["user"]["name"] == "Ayesha Admin"
    assert "password_hash" not in body["user"] and "password" not in response.text.lower().replace("password_hash", "")
    assert body["user"]["last_login_at"] is not None

    me = client.get("/auth/me", headers=auth(body["access_token"]))
    assert me.status_code == 200 and me.json()["id"] == admin.id and "password_hash" not in me.json()


def test_login_rejects_bad_credentials_and_deactivated_accounts(client, make_user):
    user = make_user()
    assert login(client, user.email, "wrong password").status_code == 401
    assert login(client, user.email, "wrong password").json()["detail"] == "Email or password is incorrect"
    assert login(client, f"{PREFIX}nobody@example.test").json()["detail"] == "Email or password is incorrect"
    assert login(client, user.email, "x" * 200).status_code == 401       # over bcrypt's 72 bytes: a 401, not a 500
    inactive = make_user(active=False)
    assert login(client, inactive.email).status_code == 401
    assert login(client, inactive.email).json()["detail"] == "This account has been deactivated"
    assert client.post("/auth/login", json={"email": "not-an-email", "password": PASSWORD}).status_code == 422


def test_protected_reads_require_a_valid_token(client, make_user):
    assert client.get("/products", params={"limit": 1}).status_code == 401
    assert client.get("/products", params={"limit": 1}, headers=auth("not.a.token")).status_code == 401
    assert client.get("/auth/me", headers={"Authorization": "Basic abc"}).status_code == 401
    user = make_user()
    expired = create_access_token(user, expires_minutes=-1)
    assert client.get("/products", params={"limit": 1}, headers=auth(expired)).status_code == 401
    token = login(client, user.email).json()["access_token"]
    assert client.get("/products", params={"limit": 1}, headers=auth(token)).status_code == 200
    with SessionLocal() as db:                              # deactivation takes effect on the next request
        db.get(User, user.id).is_active = False
        db.commit()
    assert client.get("/products", params={"limit": 1}, headers=auth(token)).status_code == 401
    assert client.get("/health").status_code == 200        # public
    assert client.get("/health/db").status_code in (200, 503)


def test_officer_can_read_but_not_write(client, make_user):
    officer = make_user(ROLE_OFFICER)
    token = login(client, officer.email).json()["access_token"]
    headers = auth(token)
    assert client.get("/dashboard/summary", headers=headers).status_code == 200
    assert client.get("/products", params={"limit": 1}, headers=headers).status_code == 200
    assert client.get("/suppliers", params={"limit": 1}, headers=headers).status_code == 200
    assert client.post("/predictions/refresh", headers=headers).status_code == 403
    assert client.get("/predictions/preview", headers=headers).status_code == 403
    assert client.post("/recommendations/refresh", headers=headers).status_code == 403
    upload = client.post("/data/import", headers=headers, data={"dataset": "hospitals"},
                         files={"file": ("hospitals.csv", io.BytesIO(b"Hospital_ID\n"), "text/csv")})
    assert upload.status_code == 403
    assert client.get("/users", headers=headers).status_code == 403
    assert client.post("/users", headers=headers, json={"name": "x", "email": f"{PREFIX}x@example.test", "role": ROLE_OFFICER, "password": PASSWORD}).status_code == 403


def test_admin_manages_users_with_guards(client, make_user):
    admin = make_user(ROLE_ADMIN)
    headers = auth(login(client, admin.email).json()["access_token"])
    email = f"{PREFIX}{uuid.uuid4().hex[:8]}@Example.Test"

    created = client.post("/users", headers=headers, json={"name": " New Officer ", "email": email, "role": ROLE_OFFICER, "password": PASSWORD})
    assert created.status_code == 201, created.text
    new = created.json()
    assert new["email"] == email.lower() and new["name"] == "New Officer" and new["is_active"] is True and "password_hash" not in new
    assert client.post("/users", headers=headers, json={"name": "Dup", "email": email, "role": ROLE_OFFICER, "password": PASSWORD}).status_code == 409
    assert client.post("/users", headers=headers, json={"name": "Short", "email": f"{PREFIX}s@example.test", "role": ROLE_OFFICER, "password": "short"}).status_code == 422
    assert client.post("/users", headers=headers, json={"name": "Long", "email": f"{PREFIX}l@example.test", "role": ROLE_OFFICER, "password": "p" * 73}).status_code == 422
    assert login(client, email, PASSWORD).status_code == 200   # the new officer can sign in

    listed = client.get("/users", headers=headers).json()["items"]
    assert any(u["id"] == new["id"] for u in listed) and all("password_hash" not in u for u in listed)

    promoted = client.patch(f"/users/{new['id']}", headers=headers, json={"role": ROLE_ADMIN, "password": "another secret 1"})
    assert promoted.status_code == 200 and promoted.json()["role"] == ROLE_ADMIN
    assert login(client, email, PASSWORD).status_code == 401 and login(client, email, "another secret 1").status_code == 200

    # self-lock guards
    assert client.patch(f"/users/{admin.id}", headers=headers, json={"is_active": False}).status_code == 400
    assert client.patch(f"/users/{admin.id}", headers=headers, json={"role": ROLE_OFFICER}).status_code == 400
    assert client.patch(f"/users/{admin.id}", headers=headers, json={"name": "Renamed Admin"}).json()["name"] == "Renamed Admin"

    # deactivating another admin is fine while an active admin remains
    off = client.patch(f"/users/{new['id']}", headers=headers, json={"is_active": False})
    assert off.status_code == 200 and off.json()["is_active"] is False
    assert login(client, email, "another secret 1").status_code == 401

    assert client.patch("/users/999999999", headers=headers, json={"name": "x"}).status_code == 404

    # last-admin guard: only checkable when this admin is the sole active administrator in the database
    with SessionLocal() as db:
        others = db.execute(text("SELECT count(*) FROM users WHERE role = 'ADMIN' AND is_active AND id <> :id"), {"id": admin.id}).scalar()
    if others == 0:
        second = make_user(ROLE_ADMIN)
        second_headers = auth(login(client, second.email).json()["access_token"])
        assert client.patch(f"/users/{admin.id}", headers=second_headers, json={"is_active": False}).status_code == 200
        assert client.patch(f"/users/{second.id}", headers=second_headers, json={"role": ROLE_OFFICER}).status_code == 400
        assert client.get("/auth/me", headers=headers).status_code == 401      # the deactivated admin's token stopped working
