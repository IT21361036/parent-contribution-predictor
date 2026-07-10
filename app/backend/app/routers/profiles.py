from fastapi import APIRouter, Depends

from app.auth.dependencies import CurrentUser, get_current_user

router = APIRouter(prefix="/profiles", tags=["profiles"])


@router.get("/me")
def read_my_profile(user: CurrentUser = Depends(get_current_user)):
    return {
        "id": user.id,
        "email": user.email,
        "role": user.role,
        "full_name": user.full_name,
    }
