import threading

from supabase import Client, create_client

from app.config import settings

# One client per worker thread. FastAPI runs sync route handlers on a threadpool;
# a thread-local client gives full connection reuse (fast — no per-request
# ~220ms client build or fresh TLS handshake) WITHOUT sharing one httpx pool
# across threads. That cross-thread sharing (and stale keep-alive reuse) was
# what raised intermittent ``httpx.RemoteProtocolError: Server disconnected`` —
# unhandled 500s that, generated outside CORSMiddleware, reached the browser as
# phantom CORS errors. A global singleton is unsafe; a per-call client is slow;
# per-thread is the balance.
_local = threading.local()


def get_service_client() -> Client:
    """Server-side client (service-role key), cached per worker thread.

    Bypasses RLS, so every query built with this client must apply its own
    authorization check (e.g. filter by the caller's linked child_id) rather
    than relying on the database to enforce it.
    """
    client = getattr(_local, "client", None)
    if client is None:
        client = create_client(settings.supabase_url, settings.supabase_service_role_key)
        _local.client = client
    return client
