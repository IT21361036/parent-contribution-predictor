"""Parental Engagement Index — the transparent weighted formula. These tests
pin the formula and its normalisation caps so a refactor can't silently shift
the score the model was trained against."""

from __future__ import annotations

import pytest

from app.ml import engagement
from app.ml.engagement import ATTENTION_PLACEHOLDER, compute_for_child, compute_pei
from tests.conftest import FakeSupabase


def test_all_zero_inputs_reduce_to_attention_only():
    # 0.4*0 + 0.3*0 + 0.3*0.5 = 0.15
    assert compute_pei(0.0, 0.0, ATTENTION_PLACEHOLDER) == 0.15


def test_max_inputs_saturate_at_one():
    assert compute_pei(10.0, 25.0, 1.0) == 1.0


def test_inputs_above_cap_are_clamped():
    assert compute_pei(999.0, 999.0, 1.0) == 1.0


def test_weights_are_applied():
    # Full monitoring only: 0.4*1 + 0.3*0 + 0.3*0 = 0.4
    assert compute_pei(10.0, 0.0, 0.0) == 0.4
    # Full check frequency only: 0.3
    assert compute_pei(0.0, 25.0, 0.0) == 0.3


def test_compute_for_child_sums_session_hours_and_checks():
    db = FakeSupabase()
    db.store["monitoring_sessions"] = [
        {
            "id": "s-1",
            "child_id": "c-1",
            "started_at": "2026-07-17T10:00:00+00:00",
            "ended_at": "2026-07-17T12:00:00+00:00",  # 2 hours
            "history_checks": 3,
        }
    ]
    db.store["attention_scores"] = []
    db.store["parent_child_link"] = []
    db.store["notifications"] = []
    db.store["engagement_index"] = []

    row = compute_for_child(db, "c-1")

    assert row["monitoring_hours"] == 2.0
    assert row["check_frequency"] == 3.0
    assert row["avg_attention_score"] == ATTENTION_PLACEHOLDER
    # 0.4*(2/10) + 0.3*(3/25) + 0.3*0.5 = 0.08 + 0.036 + 0.15 = 0.266
    assert row["engagement_index"] == pytest.approx(0.266)


def test_read_notifications_count_folds_into_check_frequency():
    db = FakeSupabase()
    db.store["monitoring_sessions"] = [
        {"id": "s-1", "child_id": "c-1", "started_at": None, "ended_at": None, "history_checks": 1}
    ]
    db.store["attention_scores"] = []
    db.store["parent_child_link"] = [{"id": "l-1", "parent_id": "p-1", "child_id": "c-1"}]
    db.store["notifications"] = [
        {"id": "n-1", "recipient_id": "p-1", "read_at": "2026-07-17T00:00:00+00:00"},
        {"id": "n-2", "recipient_id": "p-1", "read_at": None},  # unread — not counted
    ]
    db.store["engagement_index"] = []

    row = compute_for_child(db, "c-1")

    # 1 history check + 1 read notification = 2
    assert row["check_frequency"] == 2.0
