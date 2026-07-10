from functools import lru_cache

from supabase import Client, create_client

from app.config import settings


@lru_cache
def get_service_client() -> Client:
    """Server-side client using the service-role key.

    Bypasses RLS, so every query built with this client must apply its own
    authorization check (e.g. filter by the caller's linked child_id) rather
    than relying on the database to enforce it.
    """
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
