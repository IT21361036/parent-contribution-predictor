from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import (
    activity,
    admin,
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
