export type UserRole = 'admin' | 'parent' | 'child'

export interface Profile {
  id: string
  role: UserRole
  full_name: string
  email: string | null
  grade_level: string | null
  created_at: string
}

export interface ParentChildLink {
  id: string
  parent_id: string
  child_id: string
  relationship: string | null
  created_at: string
}

export interface Subject {
  id: string
  name: string
  grade_level: string | null
  created_at: string
}

export type MaterialType = 'document' | 'video' | 'exam_paper' | 'slide'

export interface LearningMaterial {
  id: string
  uploaded_by: string
  subject_id: string | null
  title: string
  description: string | null
  type: MaterialType
  storage_path: string
  duration_seconds: number | null
  created_at: string
}

export type QuestionType = 'mcq' | 'short_answer'

export interface QuizQuestion {
  id: string
  quiz_id: string
  question_text: string
  type: QuestionType
  options: string[] | null
  correct_answer: string | null
  marks: number
}

export interface QuizQuestionInput {
  question_text: string
  type: QuestionType
  options: string[] | null
  correct_answer: string | null
  marks: number
}

export interface Quiz {
  id: string
  created_by: string
  subject_id: string | null
  title: string
  total_marks: number | null
  created_at: string
  // Present only when the requester is an admin.
  attempt_count?: number
}

export interface QuizWithQuestions extends Quiz {
  questions: QuizQuestion[]
}

export type ActivityAction = 'view' | 'download' | 'video_watch' | 'quiz_start' | 'quiz_submit'

export interface StudentActivity {
  id: string
  child_id: string
  material_id: string | null
  action: ActivityAction
  time_spent_seconds: number | null
  watch_percent: number | null
  created_at: string
  material_title?: string | null
}

export interface QuizAttempt {
  id: string
  quiz_id: string
  child_id: string
  score: number | null
  max_score: number | null
  answers: Record<string, string> | null
  submitted_at: string
  quiz_title?: string | null
}

// Row from GET /quizzes/{id}/attempts — admin view of who took a quiz.
export interface QuizAttemptWithChild extends QuizAttempt {
  child_name: string | null
}

// The child-facing quiz view never includes correct_answer — the backend
// strips it before the response reaches this role.
export interface ChildQuizQuestion {
  id: string
  quiz_id: string
  question_text: string
  type: QuestionType
  options: string[] | null
  marks: number
}

export interface ChildQuizWithQuestions extends Quiz {
  questions: ChildQuizQuestion[]
}

export interface LinkedChild {
  link_id: string
  child_id: string
  relationship: string | null
  full_name: string | null
  grade_level: string | null
}

export type RiskBand = 'low' | 'medium' | 'high'

// One explainable contributor to a prediction — the "why" behind the band.
export interface PredictionFactor {
  feature: string
  label: string
  value: number
  importance: number
  direction: 'raises' | 'lowers'
  explanation: string
}

// Row from GET /predictions/{child_id} (the stored predictions row).
export interface Prediction {
  id: string
  child_id: string
  term: string | null
  model_version: string | null
  risk_band: RiskBand
  risk_score: number | null
  top_factors: PredictionFactor[] | null
  generated_at: string
}

// Row from GET /engagement/{child_id} — the transparent PEI scorer output.
export interface EngagementIndex {
  child_id: string
  period: string | null
  monitoring_hours: number | null
  check_frequency: number | null
  avg_attention_score: number | null
  engagement_index: number | null
  computed_at: string | null
}

// Response from POST /predictions/run (admin batch recompute).
export interface PredictionRunResult {
  predicted: number
  failed: { child_id: string; error: string }[]
  model_version: string
  metrics: Record<string, number>
}

export interface MonitoringSession {
  id: string
  parent_id: string
  child_id: string
  started_at: string
  ended_at: string | null
  pages_viewed: number
  history_checks: number
  camera_enabled: boolean
  liveness_passed: boolean | null
}

// Row from GET /admin/students/roster — one child + latest prediction summary.
export interface RosterRow {
  child_id: string
  full_name: string | null
  grade_level: string | null
  risk_band: RiskBand | null
  risk_score: number | null
  generated_at: string | null
  last_activity_at: string | null
}

// Row from academic_records (surfaced in the student detail page).
export interface AcademicRecord {
  id: string
  child_id: string
  subject_id: string | null
  term: string | null
  assessment_score: number | null
  exam_score: number | null
  attendance_pct: number | null
  created_at: string
}

// Response from GET /admin/students/{id}.
export interface StudentDetail {
  profile: Profile
  academics: AcademicRecord[]
  activity: StudentActivity[]
  attempts: QuizAttempt[]
}

// Row from GET/POST /admin/students/{id}/notes.
export interface InterventionNote {
  id: string
  child_id: string
  author_id: string
  body: string
  created_at: string
  author_name?: string | null
}

// Point from GET /engagement/{child_id}/history.
export interface EngagementPoint {
  period: string | null
  engagement_index: number | null
  computed_at: string | null
}
