"""Admin edit/delete of subjects and quizzes.

The point of these tests is the *refusals*. Both endpoints guard against
destroying data that other rows depend on, and they do it by counting
references in application code rather than letting Postgres raise a foreign-key
error — partly for a better message, but mainly because the fake client here
enforces no constraints, so a guard that relied on the database would pass every
test and still 500 in production.
"""

from __future__ import annotations

from tests.conftest import make_user


def _seed_subject(db) -> None:
    db.store["subjects"] = [
        {"id": "s-maths", "name": "Maths", "is_core": False, "grade_level": "Grade 11"},
        {"id": "s-art", "name": "Art", "is_core": False, "grade_level": "Grade 11"},
    ]
    db.store["child_subjects"] = [{"id": "cs-1", "child_id": "child-1", "subject_id": "s-art"}]
    db.store["learning_materials"] = []
    db.store["quizzes"] = []
    db.store["academic_records"] = []


def _seed_quiz(db, *, attempts: int = 0) -> None:
    db.store["quizzes"] = [
        {"id": "q-1", "title": "Algebra", "subject_id": "s-maths", "total_marks": 4, "due_date": None}
    ]
    db.store["quiz_questions"] = [
        {"id": "qq-1", "quiz_id": "q-1", "question_text": "2+2?", "type": "mcq",
         "options": ["3", "4"], "correct_answer": "4", "marks": 4},
    ]
    db.store["quiz_attempts"] = [
        {"id": f"a-{i}", "quiz_id": "q-1", "child_id": f"child-{i}", "score": 4, "max_score": 4}
        for i in range(1, attempts + 1)
    ]


MCQ = {"question_text": "Capital of Sri Lanka?", "type": "mcq",
       "options": ["Colombo", "Kandy"], "correct_answer": "Colombo", "marks": 5}


# --- subjects ------------------------------------------------------------------


def test_delete_subject_succeeds_when_nothing_references_it(client, fake_db):
    _seed_subject(fake_db)
    res = client.delete("/subjects/s-art")
    assert res.status_code == 200
    assert [s["id"] for s in fake_db.store["subjects"]] == ["s-maths"]
    # The optional-subject assignment goes with it.
    assert fake_db.store["child_subjects"] == []


def test_delete_subject_blocked_by_quizzes_and_materials(client, fake_db):
    _seed_subject(fake_db)
    fake_db.store["learning_materials"] = [{"id": "m-1", "subject_id": "s-maths"}]
    fake_db.store["quizzes"] = [
        {"id": "q-1", "subject_id": "s-maths"},
        {"id": "q-2", "subject_id": "s-maths"},
    ]

    res = client.delete("/subjects/s-maths")
    assert res.status_code == 409
    detail = res.json()["detail"]
    assert "1 material" in detail and "2 quizzes" in detail
    # Nothing was removed.
    assert len(fake_db.store["subjects"]) == 2


def test_delete_subject_blocked_by_academic_records(client, fake_db):
    _seed_subject(fake_db)
    fake_db.store["academic_records"] = [{"id": "ar-1", "subject_id": "s-maths"}]
    res = client.delete("/subjects/s-maths")
    assert res.status_code == 409
    # Singular all the way through — "1 academic records still use it" reads as a bug.
    assert "1 academic record still uses it" in res.json()["detail"]


def test_delete_missing_subject_is_404(client, fake_db):
    _seed_subject(fake_db)
    assert client.delete("/subjects/nope").status_code == 404


def test_delete_subject_is_admin_only(client, fake_db):
    _seed_subject(fake_db)
    client.set_user(make_user("parent", "parent-1"))
    assert client.delete("/subjects/s-art").status_code == 403


# --- quizzes -------------------------------------------------------------------


def test_quiz_metadata_editable_even_after_attempts(client, fake_db):
    _seed_quiz(fake_db, attempts=3)
    res = client.patch("/quizzes/q-1", json={"title": "Algebra (revised)"})
    assert res.status_code == 200
    assert res.json()["title"] == "Algebra (revised)"


def test_quiz_due_date_can_be_cleared(client, fake_db):
    _seed_quiz(fake_db)
    fake_db.store["quizzes"][0]["due_date"] = "2026-09-01T00:00:00+00:00"
    res = client.patch("/quizzes/q-1", json={"due_date": None})
    assert res.status_code == 200
    assert res.json()["due_date"] is None


def test_quiz_patch_with_no_fields_is_400(client, fake_db):
    _seed_quiz(fake_db)
    assert client.patch("/quizzes/q-1", json={}).status_code == 400


def test_replacing_questions_recomputes_total_marks(client, fake_db):
    _seed_quiz(fake_db)
    res = client.put("/quizzes/q-1/questions", json={"questions": [MCQ, {**MCQ, "marks": 3}]})
    assert res.status_code == 200
    assert res.json()["total_marks"] == 8
    # Old question replaced, not appended.
    assert len(fake_db.store["quiz_questions"]) == 2
    assert all(q["quiz_id"] == "q-1" for q in fake_db.store["quiz_questions"])


def test_replacing_questions_blocked_once_attempts_exist(client, fake_db):
    _seed_quiz(fake_db, attempts=2)
    res = client.put("/quizzes/q-1/questions", json={"questions": [MCQ]})
    assert res.status_code == 409
    assert "2 student attempt(s)" in res.json()["detail"]
    # The original paper is untouched.
    assert [q["id"] for q in fake_db.store["quiz_questions"]] == ["qq-1"]


def test_replacing_questions_rejects_mcq_without_answer_key(client, fake_db):
    _seed_quiz(fake_db)
    bad = {"question_text": "?", "type": "mcq", "options": ["a", "b"], "marks": 1}
    assert client.put("/quizzes/q-1/questions", json={"questions": [bad]}).status_code == 400


def test_replacing_questions_rejects_empty_set(client, fake_db):
    _seed_quiz(fake_db)
    assert client.put("/quizzes/q-1/questions", json={"questions": []}).status_code == 400


def test_delete_quiz_succeeds_when_unattempted(client, fake_db):
    _seed_quiz(fake_db)
    res = client.delete("/quizzes/q-1")
    assert res.status_code == 200
    assert fake_db.store["quizzes"] == []
    assert fake_db.store["quiz_questions"] == []


def test_delete_quiz_blocked_once_attempts_exist(client, fake_db):
    _seed_quiz(fake_db, attempts=1)
    res = client.delete("/quizzes/q-1")
    assert res.status_code == 409
    assert "1 student attempt(s)" in res.json()["detail"]
    assert len(fake_db.store["quizzes"]) == 1


def test_quiz_edits_are_admin_only(client, fake_db):
    _seed_quiz(fake_db)
    client.set_user(make_user("child", "child-1"))
    assert client.patch("/quizzes/q-1", json={"title": "x"}).status_code == 403
    assert client.put("/quizzes/q-1/questions", json={"questions": [MCQ]}).status_code == 403
    assert client.delete("/quizzes/q-1").status_code == 403
