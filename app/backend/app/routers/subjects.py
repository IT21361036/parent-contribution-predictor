from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.auth.dependencies import CurrentUser, get_current_user, require_role
from app.db.supabase_client import get_service_client

router = APIRouter(prefix="/subjects", tags=["subjects"])

require_content_author = require_role("admin")


class CreateSubjectRequest(BaseModel):
    name: str
    grade_level: str | None = None


@router.get("")
def list_subjects(_: CurrentUser = Depends(get_current_user)):
    client = get_service_client()
    result = client.table("subjects").select("*").order("name").execute()
    return result.data


@router.post("", status_code=201)
def create_subject(body: CreateSubjectRequest, _: CurrentUser = Depends(require_content_author)):
    client = get_service_client()
    result = (
        client.table("subjects")
        .insert({"name": body.name, "grade_level": body.grade_level})
        .execute()
    )
    return result.data[0]
