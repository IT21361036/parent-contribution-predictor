"""The Insights scatter's why-it-is-empty counters.

These exist because "the chart is blank" is the single most common support
question for this screen, and the answer is always which of the two axes has no
rows. The counters are what the admin UI turns into a sentence, so they have to
be right for the states that actually occur in the field.
"""

from __future__ import annotations


def _children(n: int) -> list[dict]:
    return [{"id": f"child-{i}", "role": "child", "full_name": f"Student {i}"} for i in range(1, n + 1)]


def test_children_exist_but_neither_table_is_seeded(client, fake_db):
    """The client's reported state: 14 accounts created through the portal, and
    nothing in either data table — because no portal screen writes them."""
    fake_db.store["profiles"] = _children(14)
    fake_db.store["engagement_index"] = []
    fake_db.store["academic_records"] = []
    fake_db.store["predictions"] = []

    body = client.get("/admin/analytics/engagement-performance").json()
    assert body["points"] == []
    assert body["r"] is None
    assert body["diagnostics"] == {"children": 14, "with_engagement": 0, "with_performance": 0}


def test_one_qualifying_student_is_still_not_enough(client, fake_db):
    """A single plottable student renders the empty state, not a one-dot chart."""
    fake_db.store["profiles"] = _children(3)
    fake_db.store["engagement_index"] = [
        {"child_id": "child-1", "engagement_index": 0.4, "computed_at": "2026-08-01"}
    ]
    fake_db.store["academic_records"] = [
        {"child_id": "child-1", "assessment_score": 70, "exam_score": 60}
    ]
    fake_db.store["predictions"] = []

    body = client.get("/admin/analytics/engagement-performance").json()
    assert len(body["points"]) == 1
    assert body["diagnostics"] == {"children": 3, "with_engagement": 1, "with_performance": 1}


def test_engagement_seeded_but_grades_missing_is_reported_separately(client, fake_db):
    """Distinguishes the two axes — the whole point of the counters."""
    fake_db.store["profiles"] = _children(4)
    fake_db.store["engagement_index"] = [
        {"child_id": f"child-{i}", "engagement_index": 0.5, "computed_at": "2026-08-01"}
        for i in range(1, 5)
    ]
    fake_db.store["academic_records"] = []
    fake_db.store["predictions"] = []

    d = client.get("/admin/analytics/engagement-performance").json()["diagnostics"]
    assert d == {"children": 4, "with_engagement": 4, "with_performance": 0}


def test_null_engagement_index_does_not_count_as_seeded(client, fake_db):
    """A row exists but the value is null — it cannot be an axis, so it must not
    be counted as one, or the message would send the admin looking in the wrong
    place."""
    fake_db.store["profiles"] = _children(2)
    fake_db.store["engagement_index"] = [
        {"child_id": "child-1", "engagement_index": None, "computed_at": "2026-08-01"}
    ]
    fake_db.store["academic_records"] = [
        {"child_id": "child-1", "assessment_score": None, "exam_score": None}
    ]
    fake_db.store["predictions"] = []

    d = client.get("/admin/analytics/engagement-performance").json()["diagnostics"]
    assert d == {"children": 2, "with_engagement": 0, "with_performance": 0}
