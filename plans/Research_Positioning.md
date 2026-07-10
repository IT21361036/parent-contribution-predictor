# Research Positioning & Model Strategy
## AI-Driven LMS with Parental Monitoring — where this research sits, and how many models you actually build

This document answers two questions your supervisor and examiners will ask: **"What field is this research in?"** and **"How many models are you training, and why?"** Lift the relevant parts into your Literature Review and Methodology sections.

---

## 1. What type of research is this called?

Your project sits at the intersection of several named fields. Using the correct terms makes the proposal sound grounded and shows you know the landscape.

| Field / Term | What it means | How your project fits |
|---|---|---|
| **Learning Analytics (LA)** | Collecting and analysing educational data to understand and improve learning. | Your umbrella field. |
| **Educational Data Mining (EDM)** | Applying machine learning to educational data to find patterns. | Your performance predictor. |
| **Predictive Learning Analytics** | The specific task of forecasting outcomes and flagging at-risk students. | Your core prediction goal. |
| **Multimodal Learning Analytics (MMLA)** | Fusing *different kinds* of data — interaction logs **plus** sensors, cameras, eye trackers — to model learner states. | **The key term for you.** The moment you add the camera on top of behavioural logs, your project becomes MMLA. |
| **Affective Computing / Engagement Detection / Attention Recognition** | Techniques for reading attention and emotional/cognitive state from video. | The sub-area your camera component borrows its methods from. |

**Say "Multimodal Learning Analytics" explicitly in your proposal.** It is the precise academic label for combining activity logs with camera-based attention data, and it signals to examiners that your camera component is part of a recognised research tradition — not a bolt-on gimmick.

### Methodology vs field
Keep these separate in your writing:
- **Design Science Research (DSR)** is your *methodology* — the "how" (build an artifact, evaluate it).
- **LA / EDM / MMLA** are your *fields* — the "what" your work contributes to.

---

## 2. The novelty — where your research gap is

The relationship between **parental involvement and student performance is already well established** in the literature. That is *not* your contribution, and claiming it would be is a mistake examiners will catch.

Your genuine, defensible novelty is:

> **Objective, camera-verified measurement of parental attention during monitoring — instead of relying on unreliable self-reports.**

Every existing engagement/attention study points the camera at the **student**. **No existing work points the camera at the parent** to verify they are genuinely attending to their child's progress. That absence is precisely your research gap — you are applying MMLA techniques (normally used on learners) to a new subject (parents), bridging two established fields.

**Framing rules to protect this:**
- Frame results as **association / prediction**, never **causation** ("more monitoring is *associated with* better results").
- Because your data is **simulated**, you are demonstrating the *method and pipeline*, not proving a real-world effect size. State this openly — it is a strength, not a weakness.

---

## 3. Model strategy — how many models, trained vs pre-trained vs fine-tuned

**The verdict for a BSc thesis: keep it lean. One model you train, one you use pre-trained, one optional extra.** Examiners reward a focused project that fully works over an ambitious one that half-works in the demo.

| Component | Approach | Trained? | Needs a dataset? |
|---|---|---|---|
| **Performance predictor** (core) | **Train from scratch** — Random Forest / XGBoost | Yes | Yes (tabular) |
| **Camera attention (A)** | **Use pre-trained** — MediaPipe Face Mesh + Iris, as-is | No | No |
| **Liveness (E)** | Library / rule logic (blink, motion) | No | No |
| **Engagement scorer** | Rule-based **weighted formula** (not ML) | No | No |
| **Attention quality (B)** | *Optional* small classifier (proxy dataset) | Only if added | Only if added |

### 3.1 Performance predictor — TRAIN (your one real trained model)
- Train on the tabular data (public datasets + your simulated Sri Lankan O/L set).
- Use **classical ML — Random Forest or XGBoost — not deep learning.** Two reasons:
  1. On tabular data, tree ensembles almost always beat neural networks.
  2. They are **explainable** — you can show feature importance ("parental engagement was the 2nd-strongest predictor"). That explainability *is* your thesis argument, so don't lose it to a black box.
- No GPU needed; trains in seconds. Save the winner as a versioned `.pkl`.

### 3.2 Camera attention (A) — PRE-TRAINED, do NOT train or fine-tune
- Use **MediaPipe Face Mesh + Iris** exactly as shipped. You write *rule logic on top* ("are the eyes pointed at the screen? accumulate attentive seconds") — that is logic, not a trained model.
- Why not train/fine-tune: (a) no parent-attention dataset exists to train on; (b) fine-tuning needs labelled gaze data, a GPU, and weeks you don't have; (c) MediaPipe is already high quality and runs **in the browser**, so raw video never leaves the device — this is your privacy backbone.

### 3.3 Liveness (E) — logic, no training
Blink / small-motion checks confirm a real live person (not a photo or looped video), protecting the validity of the attention data. Secondary to A.

### 3.4 Engagement scorer — a FORMULA, not a model
Deliberately a transparent weighted formula, e.g.:

```
PEI = 0.30 × login_frequency
    + 0.25 × response_rate
    + 0.25 × meeting_attendance
    + 0.20 × survey_score
```

No data or training required, and fully explainable. Do not turn this into an ML model.

### 3.5 Attention quality (B) — OPTIONAL
The only place you might train a small extra classifier (on DAiSEE as a proxy). Add it **only if scope allows**; drop it if time is tight. Not required for the core contribution.

### 3.6 Do you fine-tune anything? No — not for v1.
Fine-tuning only makes sense later, if you ever collect real gaze data. If asked *"why not deep learning / why not fine-tune?"*, your answer is:

> *"Tabular data favours tree ensembles, explainability matters for the parental-factor argument, and no parent-attention dataset exists — so a pre-trained detector plus simulation is the honest, appropriate approach for this scope."*

That is a strong, defensible answer.

---

## 4. One-line summary

**Field:** Multimodal Learning Analytics (within Learning Analytics / EDM), using Design Science Research.
**Novelty:** camera-verified *parental* attention, versus self-reported involvement.
**Models:** 1 trained (Random Forest/XGBoost predictor) + 1 pre-trained (MediaPipe, as-is) + 1 optional (attention-quality classifier). No fine-tuning in v1.
