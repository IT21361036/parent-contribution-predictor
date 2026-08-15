from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth.dependencies import CurrentUser, get_current_user, require_role
from app.db.supabase_client import get_service_client
from app.services.notifications import notify_quiz_result, notify_safe
from app.services.subject_access import allowed_subject_ids, assert_subject_allowed

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
    due_date: str | None = None  # ISO timestamp; drives lazy quiz_due notifications


class AttemptAnswer(BaseModel):
    question_id: str
    answer: str


class SubmitAttemptRequest(BaseModel):
    answers: list[AttemptAnswer]


class QuestionGrade(BaseModel):
    question_id: str
    marks: float


class GradeAttemptRequest(BaseModel):
    grades: list[QuestionGrade]


class UpdateQuizRequest(BaseModel):
    """Quiz metadata only — none of it invalidates an existing attempt, so this
    stays editable for the life of the quiz."""

    title: str | None = None
    subject_id: str | None = None
    due_date: str | None = None


class ReplaceQuestionsRequest(BaseModel):
    questions: list[QuestionInput]


def _validate_questions(questions: list[QuestionInput]) -> None:
    """Shared by create and replace so the two paths cannot drift apart."""
    if not questions:
        raise HTTPException(status_code=400, detail="A quiz needs at least one question")
    for q in questions:
        if q.type not in QUESTION_TYPES:
            raise HTTPException(status_code=400, detail=f"question type must be one of {sorted(QUESTION_TYPES)}")
        if q.type == "mcq" and (not q.options or not q.correct_answer):
            raise HTTPException(status_code=400, detail="MCQ questions need options and a correct_answer")


def _attempt_count(client, quiz_id: str) -> int:
    rows = client.table("quiz_attempts").select("id").eq("quiz_id", quiz_id).execute().data or []
    return len(rows)


def _get_quiz_or_404(client, quiz_id: str) -> dict:
    quiz = client.table("quizzes").select("*").eq("id", quiz_id).maybe_single().execute().data
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    return quiz


@router.get("")
def list_quizzes(subject_id: str | None = None, user: CurrentUser = Depends(get_current_user)):
    client = get_service_client()
    assert_subject_allowed(client, user, subject_id)

    query = client.table("quizzes").select("*").order("created_at", desc=True)
    if subject_id:
        query = query.eq("subject_id", subject_id)
    quizzes = query.execute().data or []

    if user.role == "child" and not subject_id:
        allowed = allowed_subject_ids(client, user.id)
        quizzes = [q for q in quizzes if q["subject_id"] in allowed]

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
    assert_subject_allowed(client, user, quiz.get("subject_id"))
    questions = client.table("quiz_questions").select("*").eq("quiz_id", quiz_id).execute().data

    # A child taking the quiz must not receive the answer key — only
    # admins (building or reviewing the quiz) see correct_answer.
    if user.role == "child":
        questions = [{k: v for k, v in q.items() if k != "correct_answer"} for q in questions]

    return {**quiz, "questions": questions}


@router.post("/{quiz_id}/attempts", status_code=201)
def submit_attempt(quiz_id: str, body: SubmitAttemptRequest, user: CurrentUser = Depends(require_child)):
    client = get_service_client()

    # Check the subject before doing any work: an attempt on a subject the
    # student does not take would pollute their score history and the
    # predictor's features.
    quiz = client.table("quizzes").select("subject_id").eq("id", quiz_id).maybe_single().execute().data
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    assert_subject_allowed(client, user, quiz.get("subject_id"))

    questions = client.table("quiz_questions").select("*").eq("quiz_id", quiz_id).execute().data
    if not questions:
        raise HTTPException(status_code=404, detail="Quiz not found")

    submitted = {a.question_id: a.answer for a in body.answers}
    max_score = sum(q["marks"] for q in questions)

    # MCQs auto-grade now. Short-answer questions carry no key here — they wait
    # for an admin to award marks (see grade_attempt), so they stay absent from
    # question_scores until then. graded is False while any such question exists.
    question_scores: dict[str, float] = {}
    needs_grading = False
    for q in questions:
        if q["type"] == "mcq":
            question_scores[q["id"]] = q["marks"] if submitted.get(q["id"]) == q["correct_answer"] else 0
        else:
            needs_grading = True

    score = sum(question_scores.values())

    attempt = (
        client.table("quiz_attempts")
        .insert(
            {
                "quiz_id": quiz_id,
                "child_id": user.id,
                "score": score,
                "max_score": max_score,
                "answers": submitted,
                "question_scores": question_scores,
                "graded": not needs_grading,
            }
        )
        .execute()
        .data[0]
    )

    client.table("student_activity").insert(
        {"child_id": user.id, "action": "quiz_submit"}
    ).execute()

    # Only a fully auto-graded (MCQ-only) attempt has a final score to announce.
    # If it needs manual grading, the parent is notified later, once an admin
    # awards the short-answer marks (see grade_attempt), to avoid a misleading
    # partial score.
    if not needs_grading:
        quiz = client.table("quizzes").select("title").eq("id", quiz_id).maybe_single().execute().data
        notify_safe(
            notify_quiz_result,
            client,
            user.id,
            quiz_id=quiz_id,
            quiz_title=(quiz or {}).get("title", "a quiz"),
            score=score,
            max_score=max_score,
        )

    return attempt


@router.post("/attempts/{attempt_id}/grade")
def grade_attempt(
    attempt_id: str, body: GradeAttemptRequest, _: CurrentUser = Depends(require_content_author)
):
    """Admin awards marks for the short-answer questions of one attempt.

    Recomputes the total score (MCQ auto marks + these manual marks), marks the
    attempt graded, and — the first time it becomes fully graded — notifies the
    linked parent(s) with the final score.
    """
    client = get_service_client()
    attempt = (
        client.table("quiz_attempts").select("*").eq("id", attempt_id).maybe_single().execute().data
    )
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    questions = client.table("quiz_questions").select("*").eq("quiz_id", attempt["quiz_id"]).execute().data
    by_id = {q["id"]: q for q in questions}
    short_answer_ids = {q["id"] for q in questions if q["type"] == "short_answer"}

    question_scores = dict(attempt.get("question_scores") or {})
    for grade in body.grades:
        question = by_id.get(grade.question_id)
        if question is None or grade.question_id not in short_answer_ids:
            raise HTTPException(
                status_code=400,
                detail="Only short-answer questions of this attempt can be graded",
            )
        if grade.marks < 0 or grade.marks > question["marks"]:
            raise HTTPException(
                status_code=400,
                detail=f"Marks must be between 0 and {question['marks']} for this question",
            )
        question_scores[grade.question_id] = grade.marks

    was_graded = attempt.get("graded", False)
    fully_graded = short_answer_ids.issubset(question_scores.keys())
    score = sum(question_scores.values())

    updated = (
        client.table("quiz_attempts")
        .update({"score": score, "question_scores": question_scores, "graded": fully_graded})
        .eq("id", attempt_id)
        .execute()
        .data[0]
    )

    # Announce the result to parents only when this grading pass completes the
    # attempt (and it wasn't already complete) — mirrors the auto-grade path.
    if fully_graded and not was_graded:
        quiz = (
            client.table("quizzes")
            .select("title")
            .eq("id", attempt["quiz_id"])
            .maybe_single()
            .execute()
            .data
        )
        notify_safe(
            notify_quiz_result,
            client,
            attempt["child_id"],
            quiz_id=attempt["quiz_id"],
            quiz_title=(quiz or {}).get("title", "a quiz"),
            score=score,
            max_score=attempt["max_score"],
        )

    return updated


@router.post("", status_code=201)
def create_quiz(body: CreateQuizRequest, user: CurrentUser = Depends(require_content_author)):
    _validate_questions(body.questions)

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
                "due_date": body.due_date,
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


# --- Editing an existing quiz --------------------------------------------------
# Split by blast radius. Metadata never invalidates a submitted attempt, so it
# stays editable forever. Questions and deletion do: `quiz_attempts` snapshots
# `max_score` and keys `question_scores` by question id, so changing the paper
# after a sitting leaves stored marks scored out of a total that no longer
# exists, against questions that no longer exist — and those attempts feed the
# performance predictor. Hence the hard 409 rather than a confirmation dialog.


@router.patch("/{quiz_id}")
def update_quiz(
    quiz_id: str, body: UpdateQuizRequest, _: CurrentUser = Depends(require_content_author)
):
    """Rename a quiz, move it to another subject, or change its due date.

    Always permitted, including after students have attempted it. Uses
    exclude_unset (not a None-filter) so `due_date` can be explicitly cleared,
    matching PATCH /subjects/{id}.
    """
    client = get_service_client()
    _get_quiz_or_404(client, quiz_id)

    changes = body.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="No fields to update")

    return client.table("quizzes").update(changes).eq("id", quiz_id).execute().data[0]


@router.put("/{quiz_id}/questions")
def replace_questions(
    quiz_id: str, body: ReplaceQuestionsRequest, _: CurrentUser = Depends(require_content_author)
):
    """Replace the whole question set and recompute total_marks.

    Refused once any attempt exists — see the note above.
    """
    client = get_service_client()
    _get_quiz_or_404(client, quiz_id)
    _validate_questions(body.questions)

    attempts = _attempt_count(client, quiz_id)
    if attempts:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Cannot change the questions: {attempts} student attempt(s) already exist and "
                "their marks would no longer match this quiz. Create a new quiz instead."
            ),
        )

    total_marks = sum(q.marks for q in body.questions)
    client.table("quiz_questions").delete().eq("quiz_id", quiz_id).execute()
    questions = (
        client.table("quiz_questions")
        .insert(
            [
                {
                    "quiz_id": quiz_id,
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
    quiz = client.table("quizzes").update({"total_marks": total_marks}).eq("id", quiz_id).execute().data[0]
    return {**quiz, "questions": questions}


@router.delete("/{quiz_id}")
def delete_quiz(quiz_id: str, _: CurrentUser = Depends(require_content_author)):
    """Delete a quiz and its questions. Refused once any attempt exists — the
    attempts FK has no ON DELETE rule, so this would otherwise surface as a raw
    foreign-key 500, and deleting graded work is not recoverable.
    """
    client = get_service_client()
    quiz = _get_quiz_or_404(client, quiz_id)

    attempts = _attempt_count(client, quiz_id)
    if attempts:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Cannot delete '{quiz['title']}': {attempts} student attempt(s) are recorded "
                "against it. Their results would be lost."
            ),
        )

    # quiz_questions cascades in Postgres; delete explicitly so the fake-client
    # test path reaches the same end state as production.
    client.table("quiz_questions").delete().eq("quiz_id", quiz_id).execute()
    client.table("quizzes").delete().eq("id", quiz_id).execute()
    return {"deleted": quiz_id}
