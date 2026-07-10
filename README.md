# Parental — AI-Driven LMS with Parental Monitoring

A role-based Learning Management System (admin / parent / student) that studies how
**parental monitoring relates to O/L student performance** in Sri Lanka. Final-year
research project, framed in **Multimodal Learning Analytics** using Design Science
Research.

The novel contribution is **camera-verified parental attention**: the parent's camera
runs in-browser during a monitoring session to confirm they are genuinely attending to
their child's progress (eyes-on-screen + liveness) — measured privately, with **no video
ever leaving the device** (only computed scores are stored).

## Stack
- **Frontend:** React + TypeScript + Tailwind (Vite), Recharts, MediaPipe Tasks Vision
- **Backend:** FastAPI (Python)
- **Data/Auth:** Supabase (Postgres + Auth + Storage)
- **ML:** one trained Random Forest performance-risk predictor (explainable) + a
  transparent weighted Parental Engagement Index (formula, not ML)

## Layout
- `app/frontend/` — the React app
- `app/backend/` — the FastAPI API + ML package (`app/ml/`)
- `app/supabase/schema.sql` — database schema + RLS policies
- `plans/` — design docs, implementation plan, and the running progress log

## Getting started
See **[app/README.md](app/README.md)** for the full setup, current phase status, and
the architecture "golden rule" (authenticated reads go direct-to-Supabase under RLS;
all writes and role checks go through FastAPI with the service-role key). Copy the
`.env.example` files in `app/frontend/` and `app/backend/` to `.env` and fill in your
own Supabase project values — real secrets are **not** committed.

> Note: the public training datasets (UCI Student Performance, OULAD) are not included
> in this repo (size + licensing); see `plans/Datasets.md` for sources.
