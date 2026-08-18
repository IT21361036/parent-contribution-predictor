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


def maybe_row(query) -> dict | None:
    """Read a ``.maybe_single()`` query safely, returning the row or ``None``.

    postgrest's ``maybe_single().execute()`` returns **None itself** when nothing
    matches — not a response object with ``data=None``. So the natural-looking
    ``...maybe_single().execute().data`` raises
    ``AttributeError: 'NoneType' object has no attribute 'data'`` on exactly the
    path it was written to handle, turning an intended 404/400 into an unhandled
    500. The in-memory test client returns a response either way, so no unit test
    can catch this; it only shows up against real Supabase.

    Always read a ``maybe_single()`` through this helper.
    """
    result = query.execute()
    return result.data if result is not None else None
