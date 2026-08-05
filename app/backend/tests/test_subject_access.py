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


def test_child_subject_list_hides_unassigned_optionals(client, fake_db):
    _seed(fake_db)
    client.set_user(make_user("child", "child-1"))

    res = client.get("/subjects")

    assert res.status_code == 200
    assert {s["id"] for s in res.json()} == {"s-maths", "s-science", "s-ict"}


def test_admin_subject_list_shows_everything(client, fake_db):
    _seed(fake_db)
    # the client fixture defaults to an admin user

    res = client.get("/subjects")

    assert res.status_code == 200
    assert len(res.json()) == 4


def _seed_materials(fake_db: FakeSupabase) -> None:
    _seed(fake_db)
    fake_db.store["learning_materials"] = [
        {"id": "m-1", "subject_id": "s-maths", "title": "Algebra", "storage_path": "p1"},
        {"id": "m-2", "subject_id": "s-ict", "title": "Databases", "storage_path": "p2"},
        {"id": "m-3", "subject_id": "s-art", "title": "Colour theory", "storage_path": "p3"},
    ]


def test_child_cannot_list_materials_of_unassigned_subject(client, fake_db):
    _seed_materials(fake_db)
    client.set_user(make_user("child", "child-1"))

    res = client.get("/materials?subject_id=s-art")

    assert res.status_code == 403


def test_child_can_list_materials_of_assigned_subject(client, fake_db):
    _seed_materials(fake_db)
    client.set_user(make_user("child", "child-1"))

    res = client.get("/materials?subject_id=s-ict")

    assert res.status_code == 200
    assert [m["id"] for m in res.json()] == ["m-2"]


def test_unfiltered_material_list_excludes_unassigned_subjects(client, fake_db):
    _seed_materials(fake_db)
    client.set_user(make_user("child", "child-1"))

    res = client.get("/materials")

    assert res.status_code == 200
    assert {m["id"] for m in res.json()} == {"m-1", "m-2"}


def test_child_cannot_download_material_of_unassigned_subject(client, fake_db):
    _seed_materials(fake_db)
    client.set_user(make_user("child", "child-1"))

    res = client.get("/materials/m-3/download")

    assert res.status_code == 403


def test_admin_material_list_is_never_filtered(client, fake_db):
    _seed_materials(fake_db)

    res = client.get("/materials")

    assert res.status_code == 200
    assert len(res.json()) == 3


def _seed_quizzes(fake_db: FakeSupabase) -> None:
    _seed(fake_db)
    fake_db.store["quizzes"] = [
        {"id": "q-maths", "subject_id": "s-maths", "title": "Algebra test", "total_marks": 1},
        {"id": "q-art", "subject_id": "s-art", "title": "Colour test", "total_marks": 1},
    ]
    fake_db.store["quiz_questions"] = [
        {"id": "qq-1", "quiz_id": "q-art", "question_text": "Primary?",
         "type": "mcq", "options": ["Red", "Green"], "correct_answer": "Red", "marks": 1},
    ]


def test_child_cannot_open_quiz_of_unassigned_subject(client, fake_db):
    _seed_quizzes(fake_db)
    client.set_user(make_user("child", "child-1"))

    res = client.get("/quizzes/q-art")

    assert res.status_code == 403


def test_child_cannot_submit_attempt_for_unassigned_subject(client, fake_db):
    _seed_quizzes(fake_db)
    client.set_user(make_user("child", "child-1"))

    res = client.post(
        "/quizzes/q-art/attempts",
        json={"answers": [{"question_id": "qq-1", "answer": "Red"}]},
    )

    assert res.status_code == 403
    # And nothing was recorded against the student.
    assert fake_db.store.get("quiz_attempts", []) == []


def test_unfiltered_quiz_list_excludes_unassigned_subjects(client, fake_db):
    _seed_quizzes(fake_db)
    client.set_user(make_user("child", "child-1"))

    res = client.get("/quizzes")

    assert res.status_code == 200
    assert [q["id"] for q in res.json()] == ["q-maths"]


def test_child_quiz_list_rejects_unassigned_subject_filter(client, fake_db):
    _seed_quizzes(fake_db)
    client.set_user(make_user("child", "child-1"))

    res = client.get("/quizzes?subject_id=s-art")

    assert res.status_code == 403


def _seed_children(fake_db: FakeSupabase) -> None:
    _seed(fake_db)
    fake_db.store["profiles"] = [
        {"id": "child-1", "role": "child", "full_name": "Nimal", "email": "n@x.io"},
        {"id": "parent-1", "role": "parent", "full_name": "Parent", "email": "p@x.io"},
    ]


def test_get_student_subjects_splits_core_and_optional(client, fake_db):
    _seed_children(fake_db)

    res = client.get("/admin/students/child-1/subjects")

    assert res.status_code == 200
    body = res.json()
    assert {s["id"] for s in body["core"]} == {"s-maths", "s-science"}
    assert {s["id"] for s in body["optional"]} == {"s-ict", "s-art"}
    assert body["assigned_ids"] == ["s-ict"]


def test_put_replaces_the_whole_assigned_set(client, fake_db):
    _seed_children(fake_db)

    res = client.put("/admin/students/child-1/subjects", json={"subject_ids": ["s-art"]})

    assert res.status_code == 200
    assert res.json()["assigned_ids"] == ["s-art"]
    rows = fake_db.store["child_subjects"]
    assert [r["subject_id"] for r in rows] == ["s-art"]
    assert rows[0]["assigned_by"] == "admin-1"


def test_put_can_clear_every_assignment(client, fake_db):
    _seed_children(fake_db)

    res = client.put("/admin/students/child-1/subjects", json={"subject_ids": []})

    assert res.status_code == 200
    assert fake_db.store["child_subjects"] == []


def test_put_rejects_an_unknown_subject_id(client, fake_db):
    _seed_children(fake_db)

    res = client.put("/admin/students/child-1/subjects", json={"subject_ids": ["s-nope"]})

    assert res.status_code == 400


def test_put_rejects_a_core_subject(client, fake_db):
    _seed_children(fake_db)

    res = client.put("/admin/students/child-1/subjects", json={"subject_ids": ["s-maths"]})

    assert res.status_code == 400


def test_put_rejects_duplicate_ids(client, fake_db):
    _seed_children(fake_db)

    res = client.put("/admin/students/child-1/subjects", json={"subject_ids": ["s-art", "s-art"]})

    assert res.status_code == 400


def test_put_rejects_a_non_child_profile(client, fake_db):
    _seed_children(fake_db)

    res = client.put("/admin/students/parent-1/subjects", json={"subject_ids": ["s-art"]})

    assert res.status_code == 404


def test_new_subjects_are_core_by_default(client, fake_db):
    res = client.post("/subjects", json={"name": "History"})

    assert res.status_code == 201
    assert res.json()["is_core"] is True


def test_a_subject_can_be_created_as_optional(client, fake_db):
    res = client.post("/subjects", json={"name": "Music", "is_core": False})

    assert res.status_code == 201
    assert res.json()["is_core"] is False


def test_patch_flips_a_subject_to_optional(client, fake_db):
    _seed(fake_db)

    res = client.patch("/subjects/s-maths", json={"is_core": False})

    assert res.status_code == 200
    assert res.json()["is_core"] is False


def test_flipping_a_subject_to_core_clears_its_assignments(client, fake_db):
    _seed(fake_db)
    assert fake_db.store["child_subjects"]  # s-ict is assigned to child-1

    res = client.patch("/subjects/s-ict", json={"is_core": True})

    assert res.status_code == 200
    # Core is implicit, so keeping the rows would be meaningless — and they
    # would silently reappear if the subject were flipped back to optional.
    assert fake_db.store["child_subjects"] == []


def test_patch_with_no_fields_is_rejected(client, fake_db):
    _seed(fake_db)

    res = client.patch("/subjects/s-maths", json={})

    assert res.status_code == 400


def test_patch_of_a_missing_subject_is_404(client, fake_db):
    _seed(fake_db)

    res = client.patch("/subjects/s-nope", json={"is_core": False})

    assert res.status_code == 404
