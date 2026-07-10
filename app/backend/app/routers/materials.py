import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.auth.dependencies import CurrentUser, get_current_user, require_role
from app.db.supabase_client import get_service_client

router = APIRouter(prefix="/materials", tags=["materials"])

require_content_author = require_role("admin")

MATERIAL_TYPES = {"document", "video", "exam_paper", "slide"}
STORAGE_BUCKET = "materials"


@router.get("")
def list_materials(subject_id: str | None = None, _: CurrentUser = Depends(get_current_user)):
    client = get_service_client()
    query = client.table("learning_materials").select("*").order("created_at", desc=True)
    if subject_id:
        query = query.eq("subject_id", subject_id)
    return query.execute().data


@router.post("", status_code=status.HTTP_201_CREATED)
def upload_material(
    title: str = Form(...),
    type: str = Form(...),
    subject_id: str = Form(...),
    description: str | None = Form(None),
    duration_seconds: int | None = Form(None),
    file: UploadFile = File(...),
    user: CurrentUser = Depends(require_content_author),
):
    if type not in MATERIAL_TYPES:
        raise HTTPException(status_code=400, detail=f"type must be one of {sorted(MATERIAL_TYPES)}")

    client = get_service_client()
    storage_path = f"{subject_id}/{uuid.uuid4()}_{file.filename}"

    file_bytes = file.file.read()
    client.storage.from_(STORAGE_BUCKET).upload(
        storage_path,
        file_bytes,
        {"content-type": file.content_type or "application/octet-stream"},
    )

    result = (
        client.table("learning_materials")
        .insert(
            {
                "uploaded_by": user.id,
                "subject_id": subject_id,
                "title": title,
                "description": description,
                "type": type,
                "storage_path": storage_path,
                "duration_seconds": duration_seconds,
            }
        )
        .execute()
    )
    return result.data[0]


@router.get("/{material_id}/download")
def get_download_url(material_id: str, _: CurrentUser = Depends(get_current_user)):
    client = get_service_client()
    material = (
        client.table("learning_materials").select("storage_path").eq("id", material_id).single().execute().data
    )
    if not material:
        raise HTTPException(status_code=404, detail="Material not found")

    signed = client.storage.from_(STORAGE_BUCKET).create_signed_url(material["storage_path"], 3600)
    url = signed.get("signedURL") or signed.get("signedUrl")
    if not url:
        raise HTTPException(status_code=500, detail="Failed to generate download link")
    return {"url": url}
