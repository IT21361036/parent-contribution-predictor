from dataclasses import dataclass

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

from app.config import settings
from app.db.supabase_client import get_service_client

bearer_scheme = HTTPBearer()

# Supabase signs user session tokens with a per-project asymmetric key
# (ES256/RS256), not the legacy shared JWT secret — that secret only signs
# the static anon/service_role API keys. Verification must go through the
# project's JWKS endpoint, keyed by the token's `kid`.
_jwks_client = PyJWKClient(f"{settings.supabase_url}/auth/v1/.well-known/jwks.json")


@dataclass
class CurrentUser:
    id: str
    email: str | None
    role: str
    full_name: str


def _decode_token(token: str) -> dict:
    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256", "RS256"],
            audience="authenticated",
            # Supabase stamps `iat` using its own server clock, which is
            # never perfectly in sync with this machine's clock — without
            # tolerance, a token can arrive "before" its own issue time by
            # a fraction of a second and get rejected as immature.
            leeway=10,
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {exc}",
        ) from exc


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> CurrentUser:
    payload = _decode_token(credentials.credentials)
    user_id = payload["sub"]

    client = get_service_client()
    result = client.table("profiles").select("*").eq("id", user_id).single().execute()
    profile = result.data
    if not profile:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No profile found for this account")

    return CurrentUser(
        id=profile["id"],
        email=profile.get("email"),
        role=profile["role"],
        full_name=profile["full_name"],
    )


def require_role(*allowed_roles: str):
    async def checker(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{user.role}' is not permitted to perform this action",
            )
        return user

    return checker
