"""Editing a parent-child link.

A link is an access grant — it decides whose data a parent can read — so the
tests here mostly check that PATCH cannot be used to get around the checks a
create has to pass: wrong roles, unknown ids, or a duplicate pair (the table has
`unique (parent_id, child_id)`).
"""

from __future__ import annotations

from tests.conftest import make_user


def _seed(db) -> None:
    db.store["profiles"] = [
        {"id": "parent-1", "role": "parent", "full_name": "Parent One"},
        {"id": "parent-2", "role": "parent", "full_name": "Parent Two"},
        {"id": "child-1", "role": "child", "full_name": "Ravi"},
        {"id": "child-2", "role": "child", "full_name": "Nimal"},
        {"id": "admin-1", "role": "admin", "full_name": "Admin"},
    ]
    db.store["parent_child_link"] = [
        {"id": "link-1", "parent_id": "parent-1", "child_id": "child-1", "relationship": "Mother"},
        {"id": "link-2", "parent_id": "parent-2", "child_id": "child-2", "relationship": None},
    ]


def test_relabel_relationship(client, fake_db):
    _seed(fake_db)
    res = client.patch("/admin/links/link-1", json={"relationship": "Guardian"})
    assert res.status_code == 200
    assert res.json()["relationship"] == "Guardian"
    # The link itself is untouched.
    assert res.json()["parent_id"] == "parent-1"
    assert res.json()["child_id"] == "child-1"


def test_relationship_can_be_cleared(client, fake_db):
    _seed(fake_db)
    assert client.patch("/admin/links/link-1", json={"relationship": None}).json()["relationship"] is None


def test_blank_relationship_becomes_null_not_empty_string(client, fake_db):
    """An empty badge in the UI is worse than no badge."""
    _seed(fake_db)
    assert client.patch("/admin/links/link-1", json={"relationship": "   "}).json()["relationship"] is None


def test_relationship_is_trimmed(client, fake_db):
    _seed(fake_db)
    assert client.patch("/admin/links/link-1", json={"relationship": "  Father  "}).json()["relationship"] == "Father"


def test_retarget_the_child(client, fake_db):
    """The reason this feature exists — a link created against the wrong child."""
    _seed(fake_db)
    res = client.patch("/admin/links/link-1", json={"child_id": "child-2"})
    assert res.status_code == 200
    assert res.json()["child_id"] == "child-2"
    assert res.json()["parent_id"] == "parent-1"


def test_retarget_both_sides_at_once(client, fake_db):
    _seed(fake_db)
    res = client.patch(
        "/admin/links/link-1", json={"parent_id": "parent-2", "child_id": "child-1", "relationship": "Father"}
    )
    assert res.status_code == 200
    assert (res.json()["parent_id"], res.json()["child_id"]) == ("parent-2", "child-1")


def test_cannot_point_the_parent_slot_at_a_child(client, fake_db):
    _seed(fake_db)
    res = client.patch("/admin/links/link-1", json={"parent_id": "child-2"})
    assert res.status_code == 400
    assert "parent_id" in res.json()["detail"]


def test_cannot_point_the_child_slot_at_a_parent(client, fake_db):
    _seed(fake_db)
    res = client.patch("/admin/links/link-1", json={"child_id": "parent-2"})
    assert res.status_code == 400
    assert "child_id" in res.json()["detail"]


def test_unknown_id_is_a_400_not_a_500(client, fake_db):
    """The create path used .single(), which raised inside postgrest for a missing
    id and surfaced as a 500. The shared helper uses maybe_single()."""
    _seed(fake_db)
    assert client.patch("/admin/links/link-1", json={"parent_id": "nope"}).status_code == 400


def test_duplicate_pair_is_refused(client, fake_db):
    """unique (parent_id, child_id) — retargeting onto an existing pair must 409."""
    _seed(fake_db)
    res = client.patch("/admin/links/link-2", json={"parent_id": "parent-1", "child_id": "child-1"})
    assert res.status_code == 409
    assert "already linked" in res.json()["detail"]
    # Nothing changed.
    assert fake_db.store["parent_child_link"][1]["parent_id"] == "parent-2"


def test_a_link_may_keep_its_own_pair(client, fake_db):
    """Re-sending the same pair (e.g. alongside a relabel) is not a duplicate."""
    _seed(fake_db)
    res = client.patch(
        "/admin/links/link-1",
        json={"parent_id": "parent-1", "child_id": "child-1", "relationship": "Mother"},
    )
    assert res.status_code == 200


def test_empty_patch_is_400(client, fake_db):
    _seed(fake_db)
    assert client.patch("/admin/links/link-1", json={}).status_code == 400


def test_unknown_link_is_404(client, fake_db):
    _seed(fake_db)
    assert client.patch("/admin/links/nope", json={"relationship": "x"}).status_code == 404


def test_link_editing_is_admin_only(client, fake_db):
    _seed(fake_db)
    client.set_user(make_user("parent", "parent-1"))
    assert client.patch("/admin/links/link-1", json={"relationship": "x"}).status_code == 403


def test_create_still_rejects_a_duplicate_pair(client, fake_db):
    """The create path now shares the same guard, so it gains the 409 too."""
    _seed(fake_db)
    res = client.post(
        "/admin/links", json={"parent_id": "parent-1", "child_id": "child-1", "relationship": "Mother"}
    )
    assert res.status_code == 409
