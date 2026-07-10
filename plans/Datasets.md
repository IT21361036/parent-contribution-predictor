# Datasets — Sourcing & Strategy
## AI-Driven LMS with Parental Monitoring — where to get data, and what each dataset is for

This is your standalone dataset reference. The single most important idea: **you have two completely separate data needs, and they must never be confused.**

---

## The two data needs

| Need | Purpose | Data type | Trained on it? |
|---|---|---|---|
| **1. Tabular data** | Train the performance predictor (Phase 5) | Rows of student/parent features | **Yes — this is the one model you train** |
| **2. Camera data** | Build/benchmark the attention detection | Face/gaze video | **No — you use a pre-trained model** |

Everything below is organised under these two headings. Only **one dataset is actually required** — a tabular set for the predictor. The camera datasets are optional benchmarks; the detection itself uses a pre-trained model that needs no dataset.

---

## Need 1 — Tabular data (for the performance predictor)

These carry the parental-engagement columns your hypothesis depends on. Your plan: combine one or two of these with a **simulated Sri Lankan O/L dataset** grounded in their statistics, tagging every simulated row with a `data_source` field for transparency.

| Dataset | What it gives you | Parental fields | Link |
|---|---|---|---|
| **xAPI-Edu-Data** ⭐ *best fit* | 480 records, student behaviour + engagement, clean and beginner-friendly | `ParentAnsweringSurvey`, `ParentschoolSatisfaction`, `Relation` (parent responsible) | kaggle.com/datasets/aljarah/xAPI-Edu-Data |
| **UCI Student Performance** | Portuguese school grades + family/social features | `Medu`/`Fedu` (parent education), `famsup` (family support), `guardian`, `famrel` (family relationship quality) | archive.ics.uci.edu/dataset/320/student+performance |
| **OULAD** (Open University Learning Analytics Dataset) | Large-scale clickstream/behavioural data — excellent for the *activity* side | None (behavioural only) | analyse.kmi.open.ac.uk/open_dataset |
| **Synthetic Student Performance** | ~10k synthetic rows — for UI/demo testing only, not for real conclusions | Varies | kaggle.com/datasets/haseebindata/student-performance-predictions |

**Recommended approach:** start with **xAPI-Edu-Data** (it has genuine parental fields), study the statistical relationships, then generate your simulated Sri Lankan O/L dataset to match. Use UCI for extra family-context features and OULAD if you want richer behavioural patterns.

---

## Need 2 — Camera / attention data (the "cam thing")

**Read this carefully — it's the part supervisors always probe.**

> **There is no "perfect dataset" for your camera component, and there cannot be — because no one has ever recorded parents watching their child's dashboard. Every education attention dataset is of *students*. That absence IS your novelty.**

So your strategy here is fundamentally different from the predictor:

### You don't train a model — you use a pre-trained one
- **MediaPipe Face Mesh + Iris** (Google) — pre-trained, runs in the browser, detects eye/gaze geometry. **No dataset needed.** This is your primary tool. "Is the person looking at the screen?" is the same geometry whether the subject is a student or a parent.
- Not a downloadable dataset — a pre-trained model/library you call directly.

### Optional: datasets to validate or benchmark your attention logic
Use these only if you want to say "our attention approach is grounded in established data." Treat them as **proxies** (they're students, not parents — the geometry transfers, the context doesn't):

| Dataset | What it is | Notes |
|---|---|---|
| **DAiSEE** ⭐ *the standard* | 9,068 ten-second video clips from 112 users, labelled for boredom, confusion, engagement, frustration | Free download at IIT Hyderabad: people.iith.ac.in/vineethnb/resources/daisee |
| **EngageNet** (Engagement-in-the-Wild) | 31 hours, 127 participants, 11,300+ clips; behavioural + cognitive engagement | Larger and more recent than DAiSEE |
| **EduGage** (2025/2026) | Synchronised multimodal sensor streams + segment-level self-reports during video learning | Newest; good for citing current work |
| **Columbia Gaze / MPIIGaze / GazeCapture** | Pure gaze-direction datasets | Use only if benchmarking raw "eyes-on-screen" accuracy |

### The actual research signal is simulated
The relationship you're studying — *parent attention → child result* — has no real dataset, so you **simulate** it (as already decided). Generate the parent-attention values in your synthetic dataset, grounded in the tabular datasets above, and tag with `data_source`.

---

## The camera-data story in four lines (for your defense)

1. You **can't get and don't need** a real parent-attention dataset — that gap is your contribution.
2. The **detection** runs on **MediaPipe** (pre-trained, no data, in-browser for privacy).
3. You optionally **benchmark** your gaze/attention logic against **DAiSEE** or a gaze dataset as a proxy.
4. You **simulate** the parent-attention-to-results relationship to train the predictor.

---

## Ethics note attached to camera data

Whichever camera datasets you touch, your own system stores **no raw video or frames — only the computed attention score/duration**. Processing happens in-browser; a consent gate precedes any camera use; the parent can see their own score. Given the involvement of minors and a webcam, expect that a formal university ethics-committee review will be required before any real (non-simulated) data collection.
