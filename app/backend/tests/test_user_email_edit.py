"""Changing an account's email.

The thing being guarded here is that an email lives in **two** systems: the
Supabase Auth user (the credential someone actually signs in with) and
`profiles.email` (the app's copy, shown in the UI). Writing only the second
leaves the account displaying an address that cannot log in, so these tests
assert the Auth call happens — and that it does *not* happen when the address is
unchanged.
"""

from __future__ import annotations

import pytest

from tests.conftest import make_user


class FakeAuthAdmin:
    """Records update_user_by_id calls; can be told to fail like Supabase would."""

    def __init__(self):
        self.calls: list[tuple[str, dict]] = []
        self.error: str | None = None

    def update_user_by_id(self, user_id, attributes):
        if self.error:
            raise RuntimeError(self.error)
        self.calls.append((user_id, attributes))
        return {"user": {"id": user_id, **attributes}}


@pytest.fixture
def auth(fake_db, monkeypatch):
    """Attach a fake auth admin to the fake DB client."""
    admin = FakeAuthAdmin()

    class Auth:
        pass

    a = Auth()
    a.admin = admin
    monkeypatch.setattr(fake_db, "auth", a, raising=False)
    return admin


def _seed(db) -> None:
    db.store["profiles"] = [
        {"id": "u-1", "role": "child", "full_name": "Ravi", "email": "old@school.lk", "grade_level": None},
        {"id": "u-2", "role": "parent", "full_name": "Parent", "email": "taken@school.lk", "grade_level": None},
    ]


BASE = {"full_name": "Ravi", "role": "child"}


def test_email_change_updates_auth_and_profile(client, fake_db, auth):
    _seed(fake_db)
    res = client.patch("/admin/users/u-1", json={**BASE, "email": "new@school.lk"})
    assert res.status_code == 200
    assert res.json()["email"] == "new@school.lk"
    # The credential moved too — this is the whole point.
    assert auth.calls == [("u-1", {"email": "new@school.lk", "email_confirm": True})]


def test_email_is_lowercased(client, fake_db, auth):
    """Supabase treats addresses case-insensitively; profiles lookups match exactly."""
    _seed(fake_db)
    res = client.patch("/admin/users/u-1", json={**BASE, "email": "  NEW@School.LK  "})
    assert res.json()["email"] == "new@school.lk"
    assert auth.calls[0][1]["email"] == "new@school.lk"


def test_unchanged_email_skips_the_auth_round_trip(client, fake_db, auth):
    _seed(fake_db)
    res = client.patch("/admin/users/u-1", json={**BASE, "email": "old@school.lk"})
    assert res.status_code == 200
    assert auth.calls == []


def test_unchanged_email_differing_only_in_case_also_skips(client, fake_db, auth):
    _seed(fake_db)
    client.patch("/admin/users/u-1", json={**BASE, "email": "OLD@SCHOOL.LK"})
    assert auth.calls == []


def test_duplicate_email_is_refused_before_touching_auth(client, fake_db, auth):
    _seed(fake_db)
    res = client.patch("/admin/users/u-1", json={**BASE, "email": "taken@school.lk"})
    assert res.status_code == 409
    assert "already uses that email" in res.json()["detail"]
    assert auth.calls == []
    # And the profile keeps its old address.
    assert fake_db.store["profiles"][0]["email"] == "old@school.lk"


def test_malformed_email_is_rejected_by_the_schema(client, fake_db, auth):
    _seed(fake_db)
    res = client.patch("/admin/users/u-1", json={**BASE, "email": "not-an-email"})
    assert res.status_code == 422  # EmailStr, same validation as create
    assert auth.calls == []


def test_supabase_rejection_becomes_a_400_not_a_500(client, fake_db, auth):
    _seed(fake_db)
    auth.error = "email address is invalid"
    res = client.patch("/admin/users/u-1", json={**BASE, "email": "new@school.lk"})
    assert res.status_code == 400
    assert "Supabase rejected" in res.json()["detail"]
    # Profile untouched, so the two systems cannot drift apart.
    assert fake_db.store["profiles"][0]["email"] == "old@school.lk"


def test_other_fields_still_update_without_an_email(client, fake_db, auth):
    _seed(fake_db)
    res = client.patch("/admin/users/u-1", json={"full_name": "Ravi K", "role": "child"})
    assert res.status_code == 200
    assert res.json()["full_name"] == "Ravi K"
    assert auth.calls == []


def test_unknown_user_is_404(client, fake_db, auth):
    _seed(fake_db)
    res = client.patch("/admin/users/nope", json={**BASE, "email": "new@school.lk"})
    assert res.status_code == 404
    assert auth.calls == []


def test_email_edit_is_admin_only(client, fake_db, auth):
    _seed(fake_db)
    client.set_user(make_user("parent", "u-2"))
    assert client.patch("/admin/users/u-1", json={**BASE, "email": "new@school.lk"}).status_code == 403
    assert auth.calls == []
