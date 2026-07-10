"""Report cards — admin uploads a PDF per student per term; linked parents (and
admins) view/download it.

Files live in the private `report-cards` Supabase bucket; every up/download goes
through here with the service-role key (RLS-vs-API golden rule). One router holds
both the admin and parent sides so all report-card logic is in one place; each
endpoint carries its own role + ownership guard.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.auth.dependencies import CurrentUser, require_role
from app.db.supabase_client import get_service_client
from app.services.notifications import notify_report_card, notify_safe

router = APIRouter(tags=["report-cards"])

require_admin = require_role("admin")
require_parent = require_role("parent")

STORAGE_BUCKET = "report-cards"


def _get_child_or_404(client, child_id: str) -> dict:
    profile = (
        client.table("profiles").select("id, role").eq("id", child_id).maybe_single().execute().data
    )
    if not profile or profile["role"] != "child":
        raise HTTPException(status_code=404, detail="Child not found")
    return profile


def _assert_linked(client, parent_id: str, child_id: str) -> None:
    link = (
        client.table("parent_child_link")
        .select("id")
        .eq("parent_id", parent_id)
        .eq("child_id", child_id)
        .execute()
        .data
    )
    if not link:
        raise HTTPException(status_code=403, detail="Not linked to this child")


def _report_card_or_404(client, report_card_id: str) -> dict:
    row = (
        client.table("report_cards")
        .select("*")
        .eq("id", report_card_id)
        .maybe_single()
        .execute()
        .data
    )
    if not row:
        raise HTTPException(status_code=404, detail="Report card not found")
    return row


def _signed_url(client, storage_path: str) -> str:
    signed = client.storage.from_(STORAGE_BUCKET).create_signed_url(storage_path, 3600)
    url = signed.get("signedURL") or signed.get("signedUrl")
    if not url:
        raise HTTPException(status_code=500, detail="Failed to generate download link")
    return url


# ---------- Admin ----------


@router.post("/admin/students/{child_id}/report-cards", status_code=status.HTTP_201_CREATED)
def upload_report_card(
    child_id: str,
    term: str = Form(...),
    title: str | None = Form(None),
    file: UploadFile = File(...),
    admin: CurrentUser = Depends(require_admin),
):
    client = get_service_client()
    _get_child_or_404(client, child_id)

    storage_path = f"{child_id}/{uuid.uuid4()}_{file.filename}"
    file_bytes = file.file.read()
    client.storage.from_(STORAGE_BUCKET).upload(
        storage_path,
        file_bytes,
        {"content-type": file.content_type or "application/pdf"},
    )

    row = (
        client.table("report_cards")
        .insert(
            {
                "child_id": child_id,
                "term": term,
                "title": title,
                "storage_path": storage_path,
                "uploaded_by": admin.id,
            }
        )
        .execute()
        .data[0]
    )

    notify_safe(notify_report_card, client, child_id, report_card_id=row["id"], term=term)
    return row


@router.get("/admin/students/{child_id}/report-cards")
def admin_list_report_cards(child_id: str, _: CurrentUser = Depends(require_admin)):
    client = get_service_client()
    _get_child_or_404(client, child_id)
    return (
        client.table("report_cards")
        .select("*")
        .eq("child_id", child_id)
        .order("created_at", desc=True)
        .execute()
        .data
    )


@router.get("/admin/report-cards/{report_card_id}/download")
def admin_download_report_card(report_card_id: str, _: CurrentUser = Depends(require_admin)):
    client = get_service_client()
    row = _report_card_or_404(client, report_card_id)
    return {"url": _signed_url(client, row["storage_path"])}


@router.delete("/admin/report-cards/{report_card_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_report_card(report_card_id: str, _: CurrentUser = Depends(require_admin)):
    client = get_service_client()
    row = _report_card_or_404(client, report_card_id)
    # Remove the stored PDF first so a deleted row never orphans a file.
    client.storage.from_(STORAGE_BUCKET).remove([row["storage_path"]])
    client.table("report_cards").delete().eq("id", report_card_id).execute()


# ---------- Parent ----------


@router.get("/parent/children/{child_id}/report-cards")
def parent_list_report_cards(child_id: str, user: CurrentUser = Depends(require_parent)):
    client = get_service_client()
    _assert_linked(client, user.id, child_id)
    return (
        client.table("report_cards")
        .select("*")
        .eq("child_id", child_id)
        .order("created_at", desc=True)
        .execute()
        .data
    )


@router.get("/parent/report-cards/{report_card_id}/download")
def parent_download_report_card(report_card_id: str, user: CurrentUser = Depends(require_parent)):
    client = get_service_client()
    row = _report_card_or_404(client, report_card_id)
    _assert_linked(client, user.id, row["child_id"])
    return {"url": _signed_url(client, row["storage_path"])}
