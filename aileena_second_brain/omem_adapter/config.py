"""O-Mem adapter configuration (L4 layer — optional)."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = ROOT.parent

DEFAULT_USER = os.environ.get("AILEENA_USER_NAME", "Aileen")
DEFAULT_AGENT = os.environ.get("AILEENA_AGENT_NAME", "Aileena")
DEFAULT_MODEL = os.environ.get("AILEENA_AGENT_MODEL", "gpt-4o-mini")
DEFAULT_KS_BASE = os.environ.get("KS_BASE", "http://localhost:8000")

PERSONA_AUTO_PATH = ROOT / "memories" / "personal" / "persona-auto.md"
OMEM_CACHE_DIR = ROOT / ".cache" / "omem"
OMEM_STORAGE_DIR = OMEM_CACHE_DIR / "memory_storage"


@dataclass(frozen=True)
class OMemConfig:
    user_name: str = DEFAULT_USER
    agent_name: str = DEFAULT_AGENT
    llm_model: str = DEFAULT_MODEL
    ks_base: str = DEFAULT_KS_BASE
    working_memory_max_size: int = 20
    number_of_retrieval_pieces: int = 15
    drop_threshold: float = 0.1
    persona_sync_min_confidence: str = "medium"  # medium | high

    @property
    def memory_dir(self) -> Path:
        return OMEM_STORAGE_DIR
