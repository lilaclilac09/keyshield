"""O-Mem L4 adapter — optional persona extraction; Markdown remains source of truth."""

from .bridge import bootstrap_from_markdown, is_omem_available, run_ingest_turn
from .config import OMemConfig
from .lightweight import extract_from_message, ingest_turn
from .persona_sync import append_persona_fact, export_persona_snapshot, sync_learned_fact

__all__ = [
    "OMemConfig",
    "append_persona_fact",
    "bootstrap_from_markdown",
    "export_persona_snapshot",
    "extract_from_message",
    "ingest_turn",
    "is_omem_available",
    "run_ingest_turn",
    "sync_learned_fact",
]
