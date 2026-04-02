from __future__ import annotations

from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[3]
DEFAULT_PIPELINE_DIR = ROOT_DIR / "pipelines"
LEGACY_PIPELINE_DIR = ROOT_DIR / "rocketride" / "pipelines"
PIPELINE_DIR = DEFAULT_PIPELINE_DIR if DEFAULT_PIPELINE_DIR.exists() else LEGACY_PIPELINE_DIR

PIPELINE_PATHS = {
    "topic_learning_plan": PIPELINE_DIR / "topic_learning_plan.pipe",
    "paper_summary": PIPELINE_DIR / "paper_summary.pipe",
    "reading_recommendation_explainer": PIPELINE_DIR / "reading_recommendation_explainer.pipe",
    "professor_research_brief": PIPELINE_DIR / "professor_research_brief.pipe",
    "future_research_directions": PIPELINE_DIR / "future_research_directions.pipe",
}


def get_pipeline_path(name: str) -> Path:
    try:
        return PIPELINE_PATHS[name]
    except KeyError as exc:
        raise KeyError(f"Unknown RocketRide pipeline '{name}'") from exc


def validate_pipeline_files() -> list[str]:
    missing: list[str] = []
    for name, path in PIPELINE_PATHS.items():
        if not path.exists():
            missing.append(f"{name}: missing file at {path}")
        elif not path.is_file():
            missing.append(f"{name}: expected a file at {path}")
    return missing
