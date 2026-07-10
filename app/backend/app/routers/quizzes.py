from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth.dependencies import CurrentUser, get_current_user, require_role
from app.db.supabase_client import get_service_client

router = APIRouter(prefix="/quizzes", tags=["quizzes"])

require_content_author = require_role("admin")
require_child = require_role("child")

QUESTION_TYPES = {"mcq", "short_answer"}


class QuestionInput(BaseModel):
    question_text: str
    type: str
    options: list[str] | None = None
    correct_answer: str | None = None
    marks: int = 1


class CreateQuizRequest(BaseModel):
    title: str
    subject_id: str
    questions: list[QuestionInput]


class AttemptAnswer(BaseModel):
    question_id: str
    answer: str


class SubmitAttemptRequest(BaseModel):
    answers: list[AttemptAnswer]


@router.get("")
def list_quizzes(subject_id: str | None = None, user: CurrentUser = Depends(get_current_user)):
    client = get_service_client()
    query = client.table("quizzes").select("*").order("created_at", desc=True)
    if subject_id:
        query = query.eq("subject_id", subject_id)
    quizzes = query.execute().data

    # Admins (the content authors) see how many attempts each quiz has received.
    if user.role == "admin" and quizzes:
        quiz_ids = [q["id"] for q in quizzes]
        attempts = client.table("quiz_attempts").select("quiz_id").in_("quiz_id", quiz_ids).execute().data
        counts: dict[str, int] = {}
        for a in attempts:
            counts[a["quiz_id"]] = counts.get(a["quiz_id"], 0) + 1
        quizzes = [{**q, "attempt_count": counts.get(q["id"], 0)} for q in quizzes]
    return quizzes


def with_quiz_titles(client, attempts: list[dict]) -> list[dict]:
    quiz_ids = list({a["quiz_id"] for a in attempts})
    if not quiz_ids:
        return attempts
    quizzes = client.table("quizzes").select("id, title").in_("id", quiz_ids).execute().data
    titles = {q["id"]: q["title"] for q in quizzes}
    return [{**a, "quiz_title": titles.get(a["quiz_id"])} for a in attempts]


@router.get("/attempts/me")
def my_attempts(user: CurrentUser = Depends(require_child)):
    client = get_service_client()
    result = (
        client.table("quiz_attempts")
        .select("*")
        .eq("child_id", user.id)
        .order("submitted_at", desc=True)
        .execute()
    )
    return with_quiz_titles(client, result.data)


@router.get("/{quiz_id}/attempts")
def quiz_attempts(quiz_id: str, _: CurrentUser = Depends(require_content_author)):
    client = get_service_client()
    quiz = client.table("quizzes").select("id").eq("id", quiz_id).single().execute().data
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")

    attempts = (
        client.table("quiz_attempts")
        .select("*")
        .eq("quiz_id", quiz_id)
        .order("submitted_at", desc=True)
        .execute()
        .data
    )
    child_ids = list({a["child_id"] for a in attempts})
    names = {}
    if child_ids:
        profiles = client.table("profiles").select("id, full_name").in_("id", child_ids).execute().data
        names = {p["id"]: p["full_name"] for p in profiles}
    return [{**a, "child_name": names.get(a["child_id"])} for a in attempts]


@router.get("/{quiz_id}")
def get_quiz(quiz_id: str, user: CurrentUser = Depends(get_current_user)):
    client = get_service_client()
    quiz = client.table("quizzes").select("*").eq("id", quiz_id).single().execute().data
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    questions = client.table("quiz_questions").select("*").eq("quiz_id", quiz_id).execute().data

    # A child taking the quiz must not receive the answer key — only
    # admins (building or reviewing the quiz) see correct_answer.
    if user.role == "child":
        questions = [{k: v for k, v in q.items() if k != "correct_answer"} for q in questions]

    return {**quiz, "questions": questions}


@router.post("/{quiz_id}/attempts", status_code=201)
def submit_attempt(quiz_id: str, body: SubmitAttemptRequest, user: CurrentUser = Depends(require_child)):
    client = get_service_client()
    questions = client.table("quiz_questions").select("*").eq("quiz_id", quiz_id).execute().data
    if not questions:
        raise HTTPException(status_code=404, detail="Quiz not found")

    submitted = {a.question_id: a.answer for a in body.answers}
    max_score = sum(q["marks"] for q in questions)
    score = sum(
        q["marks"]
        for q in questions
        if q["type"] == "mcq" and submitted.get(q["id"]) == q["correct_answer"]
    )

    attempt = (
        client.table("quiz_attempts")
        .insert(
            {
                "quiz_id": quiz_id,
                "child_id": user.id,
                "score": score,
                "max_score": max_score,
                "answers": submitted,
            }
        )
        .execute()
        .data[0]
    )

    client.table("student_activity").insert(
        {"child_id": user.id, "action": "quiz_submit"}
    ).execute()

    return attempt


@router.post("", status_code=201)
def create_quiz(body: CreateQuizRequest, user: CurrentUser = Depends(require_content_author)):
    if not body.questions:
        raise HTTPException(status_code=400, detail="A quiz needs at least one question")
    for q in body.questions:
        if q.type not in QUESTION_TYPES:
            raise HTTPException(status_code=400, detail=f"question type must be one of {sorted(QUESTION_TYPES)}")
        if q.type == "mcq" and (not q.options or not q.correct_answer):
            raise HTTPException(status_code=400, detail="MCQ questions need options and a correct_answer")

    client = get_service_client()
    total_marks = sum(q.marks for q in body.questions)

    quiz = (
        client.table("quizzes")
        .insert(
            {
                "created_by": user.id,
                "subject_id": body.subject_id,
                "title": body.title,
                "total_marks": total_marks,
            }
        )
        .execute()
        .data[0]
    )

    questions = (
        client.table("quiz_questions")
        .insert(
            [
                {
                    "quiz_id": quiz["id"],
                    "question_text": q.question_text,
                    "type": q.type,
                    "options": q.options,
                    "correct_answer": q.correct_answer,
                    "marks": q.marks,
                }
                for q in body.questions
            ]
        )
        .execute()
        .data
    )

    return {**quiz, "questions": questions}
