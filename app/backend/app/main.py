import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings

logger = logging.getLogger("app")
from app.routers import (
    activity,
    admin,
    analytics,
    engagement,
    health,
    materials,
    notifications,
    parent,
    predictions,
    profiles,
    quizzes,
    report_cards,
    students,
    subjects,
)

app = FastAPI(title="O/L LMS API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(profiles.router)
app.include_router(admin.router)
app.include_router(subjects.router)
app.include_router(materials.router)
app.include_router(quizzes.router)
app.include_router(activity.router)
app.include_router(parent.router)
app.include_router(predictions.router)
app.include_router(engagement.router)
app.include_router(students.router)
app.include_router(notifications.router)
app.include_router(report_cards.router)
app.include_router(analytics.router)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Return a JSON 500 for any unhandled error. Registered handlers run inside
    CORSMiddleware, so unlike Starlette's default error response this one keeps
    the Access-Control-Allow-Origin header — otherwise a backend 500 reaches the
    browser as a phantom CORS failure instead of the real error. Also logs the
    traceback to the server console for diagnosis.
    """
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})
