"""Test fixtures for the backend.

The endpoints call ``get_service_client()`` directly (not via FastAPI's
``Depends``), so tests monkeypatch that symbol in each router to return an
in-memory fake Supabase client. Auth is overridden through
``app.dependency_overrides[get_current_user]`` — replacing it wholesale means the
real JWKS/bearer path never runs, so no token is needed.

The fake reproduces just the postgrest query-builder surface the code uses
(select/insert/update/delete + eq/in_/order/limit + single/maybe_single). It is
deliberately small; it is not a Supabase emulator.
"""

from __future__ import annotations

import itertools
import os

# Settings load at import time (pydantic-settings), so give them dummy values
# before anything under app.* is imported. Real env vars would override these.
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
os.environ.setdefault("SUPABASE_JWT_SECRET", "test-jwt-secret")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.auth.dependencies import CurrentUser, get_current_user  # noqa: E402
from app.main import app  # noqa: E402

_ids = itertools.count(1)


def _new_id() -> str:
    return f"id-{next(_ids)}"


class _Result:
    def __init__(self, data):
        self.data = data


class _Query:
    """One postgrest-style query against a single table in the fake store."""

    def __init__(self, store: dict, table: str):
        self._store = store
        self._table = table
        self._op = "select"
        self._payload = None
        self._filters: list[tuple[str, str, object]] = []
        self._order: tuple[str, bool] | None = None
        self._limit: int | None = None
        self._single: str | None = None

    # builder methods — each returns self so calls chain like the real client
    def select(self, *_args, **_kwargs):
        self._op = "select"
        return self

    def insert(self, payload):
        self._op = "insert"
        self._payload = payload
        return self

    def update(self, payload):
        self._op = "update"
        self._payload = payload
        return self

    def delete(self):
        self._op = "delete"
        return self

    def eq(self, col, val):
        self._filters.append(("eq", col, val))
        return self

    def in_(self, col, vals):
        self._filters.append(("in", col, list(vals)))
        return self

    def order(self, col, desc=False):
        self._order = (col, desc)
        return self

    def limit(self, n):
        self._limit = n
        return self

    def single(self):
        self._single = "single"
        return self

    def maybe_single(self):
        self._single = "maybe"
        return self

    def _matches(self, row) -> bool:
        for op, col, val in self._filters:
            if op == "eq" and row.get(col) != val:
                return False
            if op == "in" and row.get(col) not in val:
                return False
        return True

    def execute(self):
        rows = self._store.setdefault(self._table, [])

        if self._op == "insert":
            items = self._payload if isinstance(self._payload, list) else [self._payload]
            inserted = []
            for item in items:
                row = dict(item)
                row.setdefault("id", _new_id())
                rows.append(row)
                inserted.append(dict(row))
            return _Result(inserted)

        if self._op == "update":
            updated = []
            for row in rows:
                if self._matches(row):
                    row.update(self._payload)
                    updated.append(dict(row))
            return _Result(updated)

        if self._op == "delete":
            self._store[self._table] = [r for r in rows if not self._matches(r)]
            return _Result([r for r in rows if self._matches(r)])

        result = [dict(r) for r in rows if self._matches(r)]
        if self._order:
            col, desc = self._order
            result.sort(key=lambda r: (r.get(col) is None, r.get(col)), reverse=desc)
        if self._limit is not None:
            result = result[: self._limit]
        if self._single in ("single", "maybe"):
            return _Result(result[0] if result else None)
        return _Result(result)


class FakeSupabase:
    def __init__(self, store: dict | None = None):
        self.store = store if store is not None else {}

    def table(self, name: str) -> _Query:
        return _Query(self.store, name)


@pytest.fixture
def fake_db():
    return FakeSupabase()


@pytest.fixture
def client(fake_db, monkeypatch):
    """TestClient with the fake DB wired into every router that reads it and a
    settable current user (defaults to an admin)."""
    # Every router that reads the DB. Listed exhaustively rather than by hand-picked
    # subset: a missing name silently leaves that router pointed at the real
    # Supabase client, so its tests fail with "Invalid API key" instead of running
    # (which is exactly how `analytics` and `admin` went untested).
    for module in (
        "activity", "admin", "analytics", "engagement", "materials", "notifications",
        "parent", "predictions", "profiles", "quizzes", "report_cards", "students",
        "subjects",
    ):
        try:
            monkeypatch.setattr(f"app.routers.{module}.get_service_client", lambda: fake_db)
        except AttributeError:
            pass
    monkeypatch.setattr("app.ml.engagement.get_service_client", lambda: fake_db, raising=False)

    state = {"user": CurrentUser(id="admin-1", email="a@x.io", role="admin", full_name="Admin")}
    app.dependency_overrides[get_current_user] = lambda: state["user"]

    test_client = TestClient(app)
    test_client.set_user = lambda user: state.__setitem__("user", user)  # type: ignore[attr-defined]
    yield test_client

    app.dependency_overrides.pop(get_current_user, None)


def make_user(role: str, uid: str = "u-1") -> CurrentUser:
    return CurrentUser(id=uid, email=f"{uid}@x.io", role=role, full_name=role.title())
