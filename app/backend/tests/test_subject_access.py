"""The resolver that decides which subjects a child may see."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.services.subject_access import allowed_subject_ids, assert_subject_allowed
from tests.conftest import FakeSupabase, make_user


def _seed(db: FakeSupabase) -> None:
    db.store["subjects"] = [
        {"id": "s-maths", "name": "Maths", "is_core": True},
        {"id": "s-science", "name": "Science", "is_core": True},
        {"id": "s-ict", "name": "ICT", "is_core": False},
        {"id": "s-art", "name": "Art", "is_core": False},
    ]
    db.store["child_subjects"] = [
        {"id": "cs-1", "child_id": "child-1", "subject_id": "s-ict"},
    ]


def test_allowed_ids_are_core_plus_assigned():
    db = FakeSupabase()
    _seed(db)
    assert allowed_subject_ids(db, "child-1") == {"s-maths", "s-science", "s-ict"}


def test_child_with_no_assignments_gets_core_only():
    db = FakeSupabase()
    _seed(db)
    assert allowed_subject_ids(db, "child-2") == {"s-maths", "s-science"}


def test_assert_allows_core_and_assigned_subjects():
    db = FakeSupabase()
    _seed(db)
    child = make_user("child", "child-1")
    # Neither call should raise.
    assert_subject_allowed(db, child, "s-maths")
    assert_subject_allowed(db, child, "s-ict")


def test_assert_rejects_unassigned_optional_subject():
    db = FakeSupabase()
    _seed(db)
    with pytest.raises(HTTPException) as exc:
        assert_subject_allowed(db, make_user("child", "child-1"), "s-art")
    assert exc.value.status_code == 403


def test_assert_never_filters_admin_or_parent():
    db = FakeSupabase()
    _seed(db)
    assert_subject_allowed(db, make_user("admin", "admin-1"), "s-art")
    assert_subject_allowed(db, make_user("parent", "parent-1"), "s-art")


def test_assert_ignores_a_missing_subject_id():
    """List endpoints pass None when no subject filter was supplied."""
    db = FakeSupabase()
    _seed(db)
    assert_subject_allowed(db, make_user("child", "child-1"), None)
