"""Filesystem paths for the ML pipeline, resolved relative to this file so
scripts work regardless of the current working directory.

Layout:
    client01/
      datasets/                    <- public + generated data (repo-level)
        archive/xAPI-Edu-Data.csv
        student+performance/student.zip
        generated/training_data.csv
      app/backend/app/ml/          <- this package
        models/predictor_v1.pkl
"""

from pathlib import Path

ML_DIR = Path(__file__).resolve().parent
MODELS_DIR = ML_DIR / "models"


def _find_datasets_dir() -> Path:
    """Walk up from this file until a sibling `datasets/` directory is found.

    Robust against the exact depth of the package inside the repo, so moving
    the backend one level up or down doesn't silently break data loading.
    """
    for parent in ML_DIR.parents:
        candidate = parent / "datasets"
        if candidate.is_dir():
            return candidate
    # Fall back to the known relative location so callers get a clear,
    # actionable path in the error rather than a mystery.
    return ML_DIR.parents[3] / "datasets"


DATASETS_DIR = _find_datasets_dir()
GENERATED_DIR = DATASETS_DIR / "generated"
TRAINING_DATA_CSV = GENERATED_DIR / "training_data.csv"

XAPI_CSV = DATASETS_DIR / "archive" / "xAPI-Edu-Data.csv"
STUDENT_PERF_ZIP = DATASETS_DIR / "student+performance" / "student.zip"

MODEL_VERSION = "v1"
MODEL_PKL = MODELS_DIR / f"predictor_{MODEL_VERSION}.pkl"
MODEL_META = MODELS_DIR / f"predictor_{MODEL_VERSION}.meta.json"
