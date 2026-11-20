# Every data endpoint requires a signed-in user since Phase 11. The suites written before that build TestClient(app)
# themselves and call reads and the admin-only refresh endpoints directly, so by default a fake active administrator
# is injected through FastAPI's dependency_overrides. Tests marked `real_auth` (tests/test_auth.py) get the real
# bearer-token check instead.

import pytest

from app.api.deps import get_current_user
from app.main import app
from app.models.user import ROLE_ADMIN, User

FAKE_ADMIN = User(id=0, name="Test Admin", email="test-admin@example.test", password_hash="", role=ROLE_ADMIN, is_active=True)


def pytest_configure(config):
    config.addinivalue_line("markers", "real_auth: use the real bearer-token check instead of the fake admin")


@pytest.fixture(autouse=True)
def signed_in_as_admin(request):
    if request.node.get_closest_marker("real_auth"):
        yield
        return
    app.dependency_overrides[get_current_user] = lambda: FAKE_ADMIN
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_current_user, None)
