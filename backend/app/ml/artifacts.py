"""Load the trained artifacts in app/ml/trained/ once and keep them in memory. Inference only, no retraining.

Both .joblib files are plain dicts saved by the Colab notebook:
  demand_forecast_pipeline.joblib = {"model_p50", "model_p90", "feature_columns", "horizons", "model_name", "version", "metrics"}
  stockout_pipeline.joblib        = {"model", "calibrator", "feature_columns", "n_days", "threshold_review",
                                     "threshold_urgent", "model_name", "version", "metrics"}
"""

import hashlib
import json
from contextlib import contextmanager
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import joblib
import xgboost as xgb
from app.ml.features import DEMAND_FEATURES, STOCKOUT_FEATURES

TRAINED_DIR = Path(__file__).parent / "trained"
DEMAND_FILE = "demand_forecast_pipeline.joblib"
STOCKOUT_FILE = "stockout_pipeline.joblib"
METRICS_FILE = "metrics.json"
FEATURES_FILE = Path(__file__).parent / "features.py"

# UBJSON key "Model" inside a pickled XGBoost booster ({"Config": {...}, "Model": {...}}).
_UBJSON_MODEL_KEY = b"L" + (5).to_bytes(8, "big") + b"Model{"


@dataclass(frozen=True)
class ModelArtifacts:
    demand: dict
    stockout: dict
    trained_on: str | None
    feature_version: str        # hash of app/ml/features.py, the feature code both models were run with

    @property
    def demand_model_name(self) -> str:
        return self.demand["model_name"]

    @property
    def demand_model_version(self) -> str:
        return self.demand["version"]

    @property
    def stockout_model_name(self) -> str:
        return self.stockout["model_name"]

    @property
    def stockout_model_version(self) -> str:
        return self.stockout["version"]

    @property
    def horizons(self) -> list[int]:
        return list(self.demand["horizons"])

    @property
    def stockout_horizon_days(self) -> int:
        return int(self.stockout["n_days"])

    @property
    def threshold_review(self) -> float:
        return float(self.stockout["threshold_review"])

    @property
    def threshold_urgent(self) -> float:
        return float(self.stockout["threshold_urgent"])


@contextmanager
def _xgboost_cpu_fallback():
    """The demand boosters were pickled on a Colab GPU (device cuda:0, updater grow_gpu_hist). On a CPU-only
    machine XGBoost cannot restore that training config ("input stream corrupted"). If that happens, restore only
    the model section (trees, base score, objective) - everything predict() needs - and leave the device on CPU."""
    original = xgb.core.Booster.__setstate__

    def setstate(self, state):
        try:
            original(self, state)
        except xgb.core.XGBoostError:
            raw = bytes(state["handle"])
            start = raw.index(_UBJSON_MODEL_KEY) + len(_UBJSON_MODEL_KEY) - 1
            self.__init__(model_file=bytearray(raw[start:-1]))
            self.__dict__.update({k: v for k, v in state.items() if k != "handle"})

    xgb.core.Booster.__setstate__ = setstate
    try:
        with xgb.config_context(verbosity=0):   # silences the expected "GPU -> CPU" notices
            yield
    finally:
        xgb.core.Booster.__setstate__ = original


def _check(artifact: dict, name: str, keys: list[str], features: list[str]) -> None:
    missing = [k for k in keys if k not in artifact]
    if missing:
        raise RuntimeError(f"{name} is missing keys {missing}")
    if list(artifact["feature_columns"]) != features:
        raise RuntimeError(f"{name} feature_columns do not match app/ml/features.py")


def load_artifacts(trained_dir: Path = TRAINED_DIR) -> ModelArtifacts:
    with _xgboost_cpu_fallback():
        demand = joblib.load(trained_dir / DEMAND_FILE)
    stockout = joblib.load(trained_dir / STOCKOUT_FILE)
    _check(demand, DEMAND_FILE, ["model_p50", "model_p90", "feature_columns", "horizons", "model_name", "version"],
           DEMAND_FEATURES)
    _check(stockout, STOCKOUT_FILE, ["model", "calibrator", "feature_columns", "n_days", "threshold_review",
                                     "threshold_urgent", "model_name", "version"], STOCKOUT_FEATURES)

    # metrics.json is written by the same notebook run; its thresholds must agree with the artifact's.
    trained_on = None
    metrics_path = trained_dir / METRICS_FILE
    if metrics_path.exists():
        metrics = json.loads(metrics_path.read_text())
        trained_on = metrics.get("trained_on")
        for key in ("threshold_review", "threshold_urgent", "n_days"):
            if metrics["stockout"][key] != stockout[key]:
                raise RuntimeError(f"{METRICS_FILE} stockout.{key}={metrics['stockout'][key]} "
                                   f"differs from {STOCKOUT_FILE} ({stockout[key]})")
    return ModelArtifacts(demand=demand, stockout=stockout, trained_on=trained_on, feature_version=feature_version())


def feature_version() -> str:
    """First 12 hex digits of the SHA-256 of features.py (line endings normalised, so a CRLF checkout matches)."""
    source = FEATURES_FILE.read_bytes().replace(b"\r\n", b"\n")
    return hashlib.sha256(source).hexdigest()[:12]


@lru_cache(maxsize=1)
def get_artifacts() -> ModelArtifacts:
    """Loaded once (at startup, see app.main) and reused by every prediction run."""
    return load_artifacts()
