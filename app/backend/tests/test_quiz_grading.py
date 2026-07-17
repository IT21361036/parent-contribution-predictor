"""Quiz grading: MCQs auto-grade on submit; short-answer questions wait for an
admin to award marks, then the parent is notified with the final score."""

from __future__ import annotations

import pytest

from tests.conftest import make_user

QUIZ_ID = "quiz-1"
CHILD_ID = "child-1"
PARENT_ID = "parent-1"


def _seed(db, *, questions):
    db.store["quizzes"] = [{"id": QUIZ_ID, "title": "Solar System", "total_marks": sum(q["marks"] for q in questions)}]
    db.store["quiz_questions"] = questions
    db.store["profiles"] = [{"id": CHILD_ID, "full_name": "Nimal", "role": "child"}]
    db.store["parent_child_link"] = [{"id": "l-1", "parent_id": PARENT_ID, "child_id": CHILD_ID}]
    db.store["notifications"] = []
    db.store["student_activity"] = []


MCQ_A = {"id": "q-mcq", "quiz_id": QUIZ_ID, "type": "mcq", "question_text": "Closest planet?", "correct_answer": "Mercury", "marks": 2}
SHORT = {"id": "q-sa", "quiz_id": QUIZ_ID, "type": "short_answer", "question_text": "Explain gravity.", "correct_answer": "attraction between masses", "marks": 3}


def _submit(client, db, answers):
    client.set_user(make_user("child", CHILD_ID))
    resp = client.post(f"/quizzes/{QUIZ_ID}/attempts", json={"answers": answers})
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_mcq_only_auto_grades_and_notifies(client, fake_db):
    _seed(fake_db, questions=[MCQ_A])
    attempt = _submit(client, fake_db, [{"question_id": "q-mcq", "answer": "Mercury"}])

    assert attempt["graded"] is True
    assert attempt["score"] == 2
    assert attempt["question_scores"] == {"q-mcq": 2}
    # Parent is notified immediately for a fully auto-graded attempt.
    notes = fake_db.store["notifications"]
    assert len(notes) == 1 and notes[0]["type"] == "quiz_result" and notes[0]["recipient_id"] == PARENT_ID


def test_wrong_mcq_scores_zero(client, fake_db):
    _seed(fake_db, questions=[MCQ_A])
    attempt = _submit(client, fake_db, [{"question_id": "q-mcq", "answer": "Venus"}])
    assert attempt["score"] == 0
    assert attempt["question_scores"] == {"q-mcq": 0}


def test_short_answer_stays_ungraded_no_notification(client, fake_db):
    _seed(fake_db, questions=[MCQ_A, SHORT])
    attempt = _submit(
        client,
        fake_db,
        [{"question_id": "q-mcq", "answer": "Mercury"}, {"question_id": "q-sa", "answer": "stuff"}],
    )
    # Only the MCQ contributes until an admin grades the short answer.
    assert attempt["graded"] is False
    assert attempt["score"] == 2
    assert "q-sa" not in attempt["question_scores"]
    assert fake_db.store["notifications"] == []  # no premature partial-score alert


def test_admin_grading_recomputes_score_and_notifies(client, fake_db):
    _seed(fake_db, questions=[MCQ_A, SHORT])
    attempt = _submit(
        client,
        fake_db,
        [{"question_id": "q-mcq", "answer": "Mercury"}, {"question_id": "q-sa", "answer": "stuff"}],
    )

    client.set_user(make_user("admin", "admin-1"))
    resp = client.post(f"/quizzes/attempts/{attempt['id']}/grade", json={"grades": [{"question_id": "q-sa", "marks": 2}]})
    assert resp.status_code == 200, resp.text
    graded = resp.json()

    assert graded["graded"] is True
    assert graded["score"] == 4  # 2 (mcq) + 2 (short answer)
    # The parent is now notified — exactly once, on completion.
    notes = fake_db.store["notifications"]
    assert len(notes) == 1 and notes[0]["type"] == "quiz_result"


def test_grade_rejects_marks_over_maximum(client, fake_db):
    _seed(fake_db, questions=[SHORT])
    attempt = _submit(client, fake_db, [{"question_id": "q-sa", "answer": "stuff"}])

    client.set_user(make_user("admin", "admin-1"))
    resp = client.post(f"/quizzes/attempts/{attempt['id']}/grade", json={"grades": [{"question_id": "q-sa", "marks": 5}]})
    assert resp.status_code == 400


def test_grade_rejects_non_short_answer_question(client, fake_db):
    _seed(fake_db, questions=[MCQ_A, SHORT])
    attempt = _submit(
        client,
        fake_db,
        [{"question_id": "q-mcq", "answer": "Mercury"}, {"question_id": "q-sa", "answer": "x"}],
    )

    client.set_user(make_user("admin", "admin-1"))
    resp = client.post(f"/quizzes/attempts/{attempt['id']}/grade", json={"grades": [{"question_id": "q-mcq", "marks": 1}]})
    assert resp.status_code == 400


def test_grade_requires_admin_role(client, fake_db):
    _seed(fake_db, questions=[SHORT])
    attempt = _submit(client, fake_db, [{"question_id": "q-sa", "answer": "x"}])

    client.set_user(make_user("child", CHILD_ID))
    resp = client.post(f"/quizzes/attempts/{attempt['id']}/grade", json={"grades": [{"question_id": "q-sa", "marks": 1}]})
    assert resp.status_code == 403


def test_grade_missing_attempt_returns_404(client, fake_db):
    _seed(fake_db, questions=[SHORT])
    client.set_user(make_user("admin", "admin-1"))
    resp = client.post("/quizzes/attempts/nope/grade", json={"grades": []})
    assert resp.status_code == 404
