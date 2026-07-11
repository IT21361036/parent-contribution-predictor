from supabase import Client, create_client

from app.config import settings


def get_service_client() -> Client:
    """Server-side client using the service-role key.

    Bypasses RLS, so every query built with this client must apply its own
    authorization check (e.g. filter by the caller's linked child_id) rather
    than relying on the database to enforce it.

    A FRESH client per call (deliberately not cached): FastAPI runs sync route
    handlers on a threadpool, and the parent dashboard fires ~9 authenticated
    requests at once. A single cached client shares one httpx connection pool
    across those threads, and stale keep-alive connections get reused — both
    surface as ``httpx.RemoteProtocolError: Server disconnected``, an unhandled
    500 that (because Starlette generates it outside CORSMiddleware) reaches the
    browser as a phantom CORS error. A per-request client sidesteps both.
    """
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
