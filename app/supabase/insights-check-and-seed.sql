-- ============================================================================
-- Insights chart: why it is empty, and how to fill it — entirely from the
-- Supabase SQL Editor. No terminal, no Python, no venv.
--
-- Background. The admin Insights scatter plots one dot per student that has
-- BOTH a parental engagement score (engagement_index) AND a grade
-- (academic_records), and the chart hides itself below two such students.
-- The two axes behave differently, which matters when choosing a fix:
--
--   * engagement_index IS written by the app. app/ml/engagement.compute_for_child
--     upserts a period='current' row whenever a parent's dashboard loads the
--     engagement panel, derived from their real monitoring sessions. So this axis
--     fills in organically once parents use the portal.
--
--   * academic_records has NO writer anywhere in the application. There is no
--     screen and no endpoint for entering a student's term grades. This axis can
--     only be seeded, or inserted by hand.
--
-- So the usual live symptom is with_engagement > 0 but with_grades = 0.
--
-- IMPORTANT before running STEP 3: it inserts period='demo' engagement rows
-- stamped now(), and the chart reads the NEWEST row per student — so it will
-- mask any real period='current' engagement scores rather than sit alongside
-- them. Nothing is deleted and it is fully reversible (remove the period='demo'
-- rows and the real ones become newest again), but if the parental engagement
-- data is real, prefer STEP 3-ALT below: it seeds only the missing grades axis.
--
-- Run STEP 1 first. It only reads.
--
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


-- ============================================================================
-- STEP 3-ALT — SEED THE GRADES AXIS ONLY (writes academic_records only)
--
-- Use this instead of STEP 3 when the parental engagement data is real — i.e.
-- STEP 1 showed with_engagement > 0 but with_grades = 0. It leaves
-- engagement_index completely untouched, so the chart's x-axis stays the genuine
-- monitoring-derived score and only the missing y-axis is filled.
--
-- READ THIS FIRST. These grades are invented, and they are derived from each
-- student's OWN real engagement score. That guarantees the scatter shows a
-- positive correlation — because this script put it there, not because the data
-- did. It is fine for a demo or a screenshot (the chart labels itself
-- "simulated cohort"), but it must never be presented as a finding: it would be
-- circular, manufacturing exactly the relationship the research sets out to
-- test. For a real result, real grades have to be entered.
--
-- Only run on a demo/test project. Rows are tagged term='demo-2026-t1', so
-- `delete from academic_records where term = 'demo-2026-t1';` undoes it.
-- ============================================================================

delete from academic_records where term = 'demo-2026-t1';

with latest_eng as (
  -- Newest engagement row per child — the same rule the chart's x-axis uses.
  select distinct on (child_id) child_id, engagement_index
  from engagement_index
  where engagement_index is not null
  order by child_id, computed_at desc
),
vals as (
  select
    p.id,
    -- Grade band tracks the child's engagement (0..1 -> roughly 42..92), with
    -- two independent uuid-derived noise terms in -8..+8 so assessment and exam
    -- differ and the correlation is strong but not perfect.
    least(99, greatest(20, round(
      42 + coalesce(e.engagement_index, 0.5) * 50
         + abs(mod(('x' || substr(md5(p.id::text), 1, 8))::bit(32)::int, 1600)) / 100.0 - 8, 1))) as assessment,
    least(99, greatest(20, round(
      42 + coalesce(e.engagement_index, 0.5) * 50
         + abs(mod(('x' || substr(md5(p.id::text), 9, 8))::bit(32)::int, 1600)) / 100.0 - 8, 1))) as exam,
    least(100, greatest(50, round(
      62 + coalesce(e.engagement_index, 0.5) * 34, 1))) as attendance
  from profiles p
  left join latest_eng e on e.child_id = p.id
  where p.role = 'child'
)
insert into academic_records (child_id, term, assessment_score, exam_score, attendance_pct)
select id, 'demo-2026-t1', assessment, exam, attendance from vals;

-- Re-run STEP 1: with_grades should equal the number of child accounts, and
-- plottable should equal with_engagement.
