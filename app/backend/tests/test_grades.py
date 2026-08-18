"""Admin entry of term grades (`academic_records`).

This table is the performance axis of the Insights scatter and a direct input to
the risk predictor, so the tests lean on the guards that keep it clean: no empty
rows, no out-of-range percentages, no duplicate term for one student (the
analytics mean would count it twice), and no editing one student's record
through another student's URL.
"""

from __future__ import annotations

from tests.conftest import make_user


def _seed(db) -> None:
    db.store["profiles"] = [
        {"id": "child-1", "role": "child", "full_name": "Ravi"},
        {"id": "child-2", "role": "child", "full_name": "Nimal"},
    ]
    db.store["academic_records"] = []


GRADE = {"term": "2026-T1", "assessment_score": 72, "exam_score": 68, "attendance_pct": 91}


def test_create_grade(client, fake_db):
    _seed(fake_db)
    res = client.post("/admin/students/child-1/grades", json=GRADE)
    assert res.status_code == 201
    row = res.json()
    assert row["child_id"] == "child-1"
    assert row["term"] == "2026-T1"
    assert row["assessment_score"] == 72


def test_term_is_trimmed_and_required(client, fake_db):
    _seed(fake_db)
    assert client.post("/admin/students/child-1/grades", json={**GRADE, "term": "   "}).status_code == 400
    res = client.post("/admin/students/child-1/grades", json={**GRADE, "term": "  2026-T2  "})
    assert res.json()["term"] == "2026-T2"


def test_empty_record_is_rejected(client, fake_db):
    _seed(fake_db)
    res = client.post("/admin/students/child-1/grades", json={"term": "2026-T1"})
    assert res.status_code == 400
    assert "at least one" in res.json()["detail"]


def test_partial_record_is_allowed(client, fake_db):
    """Assessment marks often exist before exams are sat."""
    _seed(fake_db)
    res = client.post("/admin/students/child-1/grades", json={"term": "2026-T1", "assessment_score": 55})
    assert res.status_code == 201
    assert res.json()["exam_score"] is None


def test_out_of_range_scores_are_rejected(client, fake_db):
    _seed(fake_db)
    for field in ("assessment_score", "exam_score", "attendance_pct"):
        res = client.post("/admin/students/child-1/grades", json={"term": "T", field: 850})
        assert res.status_code == 400, field
        assert field in res.json()["detail"]
    assert client.post("/admin/students/child-1/grades", json={"term": "T", "exam_score": -1}).status_code == 400


def test_duplicate_term_is_refused(client, fake_db):
    """Two rows for one term would be averaged twice on the Insights scatter."""
    _seed(fake_db)
    assert client.post("/admin/students/child-1/grades", json=GRADE).status_code == 201
    res = client.post("/admin/students/child-1/grades", json=GRADE)
    assert res.status_code == 409
    assert "already exists" in res.json()["detail"]


def test_same_term_for_a_different_student_is_fine(client, fake_db):
    _seed(fake_db)
    assert client.post("/admin/students/child-1/grades", json=GRADE).status_code == 201
    assert client.post("/admin/students/child-2/grades", json=GRADE).status_code == 201


def test_update_grade(client, fake_db):
    _seed(fake_db)
    rid = client.post("/admin/students/child-1/grades", json=GRADE).json()["id"]
    res = client.patch(f"/admin/students/child-1/grades/{rid}", json={"exam_score": 80})
    assert res.status_code == 200
    assert res.json()["exam_score"] == 80
    assert res.json()["assessment_score"] == 72  # untouched


def test_a_score_can_be_cleared_but_not_all_of_them(client, fake_db):
    _seed(fake_db)
    rid = client.post("/admin/students/child-1/grades", json=GRADE).json()["id"]
    assert client.patch(f"/admin/students/child-1/grades/{rid}", json={"exam_score": None}).status_code == 200
    res = client.patch(
        f"/admin/students/child-1/grades/{rid}",
        json={"assessment_score": None, "exam_score": None, "attendance_pct": None},
    )
    assert res.status_code == 400
    assert "at least one" in res.json()["detail"]


def test_patch_with_no_fields_is_400(client, fake_db):
    _seed(fake_db)
    rid = client.post("/admin/students/child-1/grades", json=GRADE).json()["id"]
    assert client.patch(f"/admin/students/child-1/grades/{rid}", json={}).status_code == 400


def test_cannot_touch_another_students_record(client, fake_db):
    """Ownership is checked, not just the record id."""
    _seed(fake_db)
    rid = client.post("/admin/students/child-1/grades", json=GRADE).json()["id"]
    assert client.patch(f"/admin/students/child-2/grades/{rid}", json={"exam_score": 1}).status_code == 404
    assert client.delete(f"/admin/students/child-2/grades/{rid}").status_code == 404


def test_delete_grade(client, fake_db):
    _seed(fake_db)
    rid = client.post("/admin/students/child-1/grades", json=GRADE).json()["id"]
    assert client.delete(f"/admin/students/child-1/grades/{rid}").status_code == 200
    assert fake_db.store["academic_records"] == []


def test_grades_are_admin_only(client, fake_db):
    _seed(fake_db)
    client.set_user(make_user("parent", "parent-1"))
    assert client.post("/admin/students/child-1/grades", json=GRADE).status_code == 403


def test_unknown_child_is_404(client, fake_db):
    _seed(fake_db)
    assert client.post("/admin/students/nope/grades", json=GRADE).status_code == 404
