from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth.dependencies import CurrentUser, require_role
from app.db.supabase_client import get_service_client

router = APIRouter(prefix="/activity", tags=["activity"])

require_child = require_role("child")

ACTIONS = {"view", "download", "video_watch", "quiz_start", "quiz_submit"}


class LogActivityRequest(BaseModel):
    material_id: str | None = None
    action: str
    time_spent_seconds: int | None = None
    watch_percent: float | None = None


def with_material_titles(client, rows: list[dict]) -> list[dict]:
    material_ids = list({r["material_id"] for r in rows if r["material_id"]})
    if not material_ids:
        return rows
    materials = client.table("learning_materials").select("id, title").in_("id", material_ids).execute().data
    titles = {m["id"]: m["title"] for m in materials}
    return [{**r, "material_title": titles.get(r["material_id"]) if r["material_id"] else None} for r in rows]


@router.get("/me")
def my_activity(user: CurrentUser = Depends(require_child)):
    client = get_service_client()
    result = (
        client.table("student_activity")
        .select("*")
        .eq("child_id", user.id)
        .order("created_at", desc=True)
        .execute()
    )
    return with_material_titles(client, result.data)


@router.post("", status_code=201)
def log_activity(body: LogActivityRequest, user: CurrentUser = Depends(require_child)):
    if body.action not in ACTIONS:
        raise HTTPException(status_code=400, detail=f"action must be one of {sorted(ACTIONS)}")

    client = get_service_client()
    result = (
        client.table("student_activity")
        .insert(
            {
                "child_id": user.id,
                "material_id": body.material_id,
                "action": body.action,
                "time_spent_seconds": body.time_spent_seconds,
                "watch_percent": body.watch_percent,
            }
        )
        .execute()
    )
    return result.data[0]
