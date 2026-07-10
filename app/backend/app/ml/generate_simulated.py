"""Generate a simulated Sri Lankan O/L dataset in our exact feature schema.

The generator draws each child's features from plausible distributions, then
labels a `risk_band` from a latent "success score" that weights the features
in the *directions* mined from the public data in `data_prep.study_relationships`
(higher parental involvement / quiz average / attendance / prior grades →
lower risk). Gaussian noise on the score keeps the task non-trivial so the
model has to learn rather than memorise a threshold.

Everything is tagged `data_source='simulated_sl'`. We optionally union recast
real xAPI rows (`data_source='xapi'`). Reproducible via a fixed seed.

Framing: association, not causation (Research_Positioning.md).
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from app.ml._paths import TRAINING_DATA_CSV
from app.ml.data_prep import recast_xapi
from app.ml.features import FEATURES

SEED = 42

# Weights of each (0..1 normalised) feature in the latent success score.
# Magnitudes echo the public-data evidence: prior grades and quiz performance
# dominate, parental involvement is substantial, passive activity is minor.
SUCCESS_WEIGHTS: dict[str, float] = {
    "prior_avg_score": 0.24,
    "quiz_avg_pct": 0.20,
    "attendance_pct": 0.15,
    "monitoring_hours": 0.12,
    "parental_attention": 0.10,
    "check_frequency": 0.08,
    "avg_watch_percent": 0.05,
    "quiz_count": 0.03,
    "material_activity": 0.03,
}

# Ranges used to normalise each feature to 0..1 for the success score.
NORM_RANGE: dict[str, tuple[float, float]] = {
    "quiz_avg_pct": (0.0, 1.0),
    "quiz_count": (0.0, 15.0),
    "material_activity": (0.0, 40.0),
    "avg_watch_percent": (0.0, 100.0),
    "attendance_pct": (40.0, 100.0),
    "prior_avg_score": (0.0, 100.0),
    "monitoring_hours": (0.0, 10.0),
    "check_frequency": (0.0, 25.0),
    "parental_attention": (0.0, 1.0),
}

# Absolute thresholds on the noisy success score (0..1) → risk band.
# Chosen to give a realistic, moderately balanced spread (printed at run time).
RISK_THRESHOLDS = {"low": 0.60, "medium": 0.42}  # >=0.60 low; >=0.42 medium; else high


def _norm(name: str, values: np.ndarray) -> np.ndarray:
    lo, hi = NORM_RANGE[name]
    return np.clip((values - lo) / (hi - lo), 0.0, 1.0)


def generate(n: int = 1200, seed: int = SEED) -> pd.DataFrame:
    rng = np.random.default_rng(seed)

    # A latent "engaged household + able student" factor drives several
    # features together, so the correlations between features look real
    # (an attentive parent tends to co-occur with steady attendance, etc.).
    latent = rng.beta(2.2, 2.2, n)  # centred, 0..1

    def jitter(scale: float) -> np.ndarray:
        return rng.normal(0.0, scale, n)

    df = pd.DataFrame()
    df["quiz_avg_pct"] = np.clip(0.35 + 0.5 * latent + jitter(0.12), 0.05, 1.0)
    df["quiz_count"] = np.clip(np.round(2 + 12 * latent + rng.normal(0, 2, n)), 0, 20).astype(int)
    df["material_activity"] = np.clip(np.round(5 + 30 * latent + rng.normal(0, 6, n)), 0, 80).astype(int)
    df["avg_watch_percent"] = np.clip(30 + 55 * latent + rng.normal(0, 12, n), 0, 100)
    df["attendance_pct"] = np.clip(60 + 38 * latent + rng.normal(0, 8, n), 40, 100)
    df["prior_avg_score"] = np.clip(35 + 55 * latent + rng.normal(0, 10, n), 0, 100)
    df["monitoring_hours"] = np.clip(0.5 + 8 * latent + rng.normal(0, 1.5, n), 0, 12)
    df["check_frequency"] = np.clip(np.round(1 + 20 * latent + rng.normal(0, 4, n)), 0, 30).astype(int)
    # parental_attention is the camera placeholder in production; in simulation
    # we let it vary a little around the neutral 0.5 so the model can learn a
    # (small) association without it dominating.
    df["parental_attention"] = np.clip(0.5 + 0.35 * (latent - 0.5) + rng.normal(0, 0.08, n), 0.0, 1.0)

    # Latent success score = weighted sum of normalised features + noise.
    score = np.zeros(n)
    for name, w in SUCCESS_WEIGHTS.items():
        score += w * _norm(name, df[name].to_numpy(dtype=float))
    score = score + rng.normal(0.0, 0.07, n)  # label noise
    score = np.clip(score, 0.0, 1.0)

    band = np.where(score >= RISK_THRESHOLDS["low"], "low",
                    np.where(score >= RISK_THRESHOLDS["medium"], "medium", "high"))
    df["risk_band"] = band
    df["data_source"] = "simulated_sl"

    return df[FEATURES + ["risk_band", "data_source"]]


def build_training_set(include_xapi: bool = True) -> pd.DataFrame:
    sim = generate()
    frames = [sim]
    if include_xapi:
        try:
            frames.append(recast_xapi())
        except Exception as exc:  # noqa: BLE001 — data file optional at build time
            print(f"[warn] skipping xAPI recast: {exc}")
    return pd.concat(frames, ignore_index=True)


def main() -> None:
    data = build_training_set()
    TRAINING_DATA_CSV.parent.mkdir(parents=True, exist_ok=True)
    data.to_csv(TRAINING_DATA_CSV, index=False)

    print(f"Wrote {len(data)} rows → {TRAINING_DATA_CSV}")
    print("\nrisk_band distribution:")
    print(data["risk_band"].value_counts().sort_index().to_string())
    print("\nby data_source:")
    print(data.groupby("data_source")["risk_band"].value_counts().to_string())


if __name__ == "__main__":
    main()
