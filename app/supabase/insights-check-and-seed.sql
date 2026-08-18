-- ============================================================================
-- Insights chart: why it is empty, and how to fill it — entirely from the
-- Supabase SQL Editor. No terminal, no Python, no venv.
--
-- Background. The admin Insights scatter plots one dot per student that has
-- BOTH a parental engagement score (engagement_index) AND a grade
-- (academic_records), and the chart hides itself below two such students.
-- Nothing in the portal UI writes either table — creating students, subjects,
-- materials, quizzes and attempts touches neither — so a busy, fully-populated
-- portal still shows "Not enough data yet". That is the expected outcome, not a
-- bug.
--
-- Run STEP 1 first. It only reads.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- STEP 1 — DIAGNOSE (read-only, safe anywhere)
-- ----------------------------------------------------------------------------
-- Reads as: "children" students exist; "with_engagement" have one axis,
-- "with_grades" have the other, and "plottable" have both. The chart needs
-- plottable >= 2.
with kids as (
  select id from profiles where role = 'child'
),
eng as (
  select distinct child_id from engagement_index where engagement_index is not null
),
grades as (
  select distinct child_id from academic_records
  where assessment_score is not null or exam_score is not null
)
select
  (select count(*) from kids)                                         as children,
  (select count(*) from eng    e join kids k on k.id = e.child_id)    as with_engagement,
  (select count(*) from grades g join kids k on k.id = g.child_id)    as with_grades,
  (select count(*) from kids k
     where exists (select 1 from eng    e where e.child_id = k.id)
       and exists (select 1 from grades g where g.child_id = k.id))   as plottable,
  case
    when (select count(*) from kids) = 0
      then 'No child accounts exist. Create students first.'
    when (select count(*) from kids k
            where exists (select 1 from eng    e where e.child_id = k.id)
              and exists (select 1 from grades g where g.child_id = k.id)) >= 2
      then 'Data is fine — the chart should render. If it does not, the cause is not the data.'
    else 'Not enough seeded data. Run STEP 3 below to fix it.'
  end                                                                as verdict;


-- ----------------------------------------------------------------------------
-- STEP 2 — PER-STUDENT DETAIL (read-only; optional, tells you who is missing what)
-- ----------------------------------------------------------------------------
select
  p.full_name,
  p.email,
  (e.child_id is not null) as has_engagement,
  (g.child_id is not null) as has_grades,
  case when e.child_id is not null and g.child_id is not null
       then 'plotted' else 'skipped' end as on_chart
from profiles p
left join (select distinct child_id from engagement_index where engagement_index is not null) e
       on e.child_id = p.id
left join (select distinct child_id from academic_records
           where assessment_score is not null or exam_score is not null) g
       on g.child_id = p.id
where p.role = 'child'
order by on_chart, p.full_name;


-- ============================================================================
-- STEP 3 — SEED (writes). Only run this on a demo/test project, never on a
-- database holding real student records.
--
-- Gives every existing child account one grade row and one engagement row, with
-- values spread deterministically from the student's own uuid — so re-running
-- produces identical numbers, and the scatter shows a believable trend instead
-- of every student landing on the same coordinate.
--
-- Rows are tagged term='demo-2026-t1' / period='demo', exactly like
-- app/scripts/seed_demo.py, so the two are interchangeable and
-- `python -m app.scripts.seed_demo --clear` still removes what this created.
--
-- Run all three statements below, in order.
-- ============================================================================

-- 3a. Clear any previous demo rows so this is safely repeatable.
delete from academic_records where term = 'demo-2026-t1';
delete from engagement_index where period = 'demo';

-- 3b. Insert both tables in one pass, from one shared set of values.
with kids as (
  select
    id,
    -- A latent "family involvement" factor in 0..1, derived from the uuid so it
    -- is stable across runs. mod() is applied before abs() so the most negative
    -- 32-bit integer cannot overflow.
    abs(mod(('x' || substr(md5(id::text), 1, 8))::bit(32)::int, 1000)) / 1000.0 as latent,
    -- Two independent noise terms in -8..+8, so assessment and exam differ and
    -- the correlation is strong but not perfect.
    abs(mod(('x' || substr(md5(id::text), 9, 8))::bit(32)::int, 1600)) / 100.0 - 8 as noise_a,
    abs(mod(('x' || substr(md5(id::text), 17, 8))::bit(32)::int, 1600)) / 100.0 - 8 as noise_b
  from profiles
  where role = 'child'
),
vals as (
  select
    id,
    round(latent * 9, 1)                                       as hours,
    round(latent * 22)                                         as checks,
    least(99, greatest(20, round(40 + latent * 50 + noise_a, 1))) as assessment,
    least(99, greatest(20, round(40 + latent * 50 + noise_b, 1))) as exam,
    least(100, greatest(50, round(60 + latent * 38, 1)))         as attendance
  from kids
),
ins_grades as (
  insert into academic_records (child_id, term, assessment_score, exam_score, attendance_pct)
  select id, 'demo-2026-t1', assessment, exam, attendance from vals
  returning 1
)
insert into engagement_index
  (child_id, period, monitoring_hours, check_frequency, avg_attention_score,
   engagement_index, computed_at)
select
  id,
  'demo',
  hours,
  checks,
  0.5,  -- ATTENTION_PLACEHOLDER: neutral until the Phase 7 camera lands
  -- Must match app/ml/engagement.compute_pei exactly:
  --   0.4*min(hours/10,1) + 0.3*min(checks/25,1) + 0.3*attention
  round(0.4 * least(hours / 10.0, 1) + 0.3 * least(checks / 25.0, 1) + 0.3 * 0.5, 4),
  now()
from vals;

-- 3c. Confirm it worked — re-run STEP 1. "plottable" should now equal the
-- number of child accounts, and the verdict should say the chart will render.
-- Then, in the app: Risk Predictions -> Run predictions, to colour the dots by
-- risk band. The chart itself works without that step.
