"""Optional full O-Mem bridge — requires vendored memory_chain + heavy deps."""

from __future__ import annotations

import asyncio
import importlib.util
import sys
from pathlib import Path
from typing import Any

from .config import OMemConfig
from .keyshield_llm import get_async_openai_client
from .persona_sync import export_persona_snapshot, sync_from_extraction, write_snapshot_cache

_MEMORY_CHAIN_AVAILABLE: bool | None = None


def is_omem_available() -> bool:
    global _MEMORY_CHAIN_AVAILABLE
    if _MEMORY_CHAIN_AVAILABLE is not None:
        return _MEMORY_CHAIN_AVAILABLE
    try:
        importlib.import_module("memory_chain")
        importlib.import_module("sentence_transformers")
        importlib.import_module("torch")
        _MEMORY_CHAIN_AVAILABLE = True
    except ImportError:
        _MEMORY_CHAIN_AVAILABLE = False
    return _MEMORY_CHAIN_AVAILABLE


def _load_embedding_model():
    import torch
    from sentence_transformers import SentenceTransformer

    device = "cuda" if torch.cuda.is_available() else "cpu"
    return SentenceTransformer("all-MiniLM-L6-v2").to(device)


class OMemBridge:
    """Wraps OPPO O-Mem MemoryChain when installed; KeyShield for LLM."""

    def __init__(self, config: OMemConfig | None = None) -> None:
        if not is_omem_available():
            raise ImportError(
                "Full O-Mem requires: pip install -r omem_adapter/requirements-optional.txt "
                "and vendored memory_chain/ (see omem_adapter/README.md)"
            )
        self.config = config or OMemConfig()
        self._manager: Any = None
        self._system: Any = None
        self._init_sync()

    def _init_sync(self) -> None:
        from memory_chain import MemoryChain, MemoryManager  # type: ignore

        client = get_async_openai_client(self.config)
        if client is None:
            raise RuntimeError("KS_TOKEN required for O-Mem bridge")

        embedding_model = _load_embedding_model()
        self.config.memory_dir.mkdir(parents=True, exist_ok=True)

        class _CmdArgs:
            working_memory_max_size = self.config.working_memory_max_size
            episodic_memory_refresh_rate = 5
            output_dir = str(self.config.memory_dir)
            number_of_retrieval_pieces = self.config.number_of_retrieval_pieces
            drop_threshold = self.config.drop_threshold

        args = {"model": {"llm_model": self.config.llm_model}}
        self._system = MemoryChain(
            memory_index=0,
            llm_model=self.config.llm_model,
            llm_client=client,
            embedding_model=embedding_model,
            user_name=self.config.user_name,
            agent_name=self.config.agent_name,
            cmd_args=_CmdArgs(),
            args=args,
            memory_dir=str(self.config.memory_dir),
        )
        self._manager = MemoryManager(
            memory_index=0,
            memory_system=self._system,
            llm_model=self.config.llm_model,
            llm_client=client,
            embedding_model=embedding_model,
            user_name=self.config.user_name,
            agent_name=self.config.agent_name,
            cmd_args=_CmdArgs(),
            args=args,
            memory_dir=str(self.config.memory_dir),
        )

    async def add_message(self, message: str, *, is_user: bool = True, timestamp: str | None = None) -> None:
        from datetime import datetime

        if timestamp is None:
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        idx = getattr(self, "_msg_idx", 0)
        await self._manager.receive_message(
            message=message,
            client=self._manager.client,
            index=idx,
            timestamp=timestamp,
            user_speak=is_user,
        )
        self._msg_idx = idx + 1

    def _sync_mappings(self) -> None:
        sys = self._system
        for message in list(sys.user_working_memory.working_memory_queue.queue) + sys.user_episodic_memory.episodic_memory_cache_list:
            sys.user_topic_message_dict[message["topics"]] = [message["raw_message"], message["timestamp"]]
        sys.generate_memory_detail_map()

    async def update_persona(self) -> None:
        self._sync_mappings()
        await self._system.user_persona_memory.update_preference_persona(
            self._system.user_episodic_memory.topic_episodic_memory_list
        )
        await self._system.user_persona_memory.update_attribute_persona(
            self._system.user_episodic_memory.attribute_episodic_memory_dict
        )

    async def query(self, question: str) -> str:
        self._sync_mappings()
        result, user, agent, _, _ = self._manager.retrieve_from_memory_soft_segmentation(
            question=question,
            topn=self.config.number_of_retrieval_pieces,
            drop_threshold=self.config.drop_threshold,
        )
        answer, _ = await self._manager.generate_system_response(
            query=question,
            restrieval_result=result,
            client=self._manager.client,
            speaker_a=user,
            speaker_b=agent,
            llm_model=self.config.llm_model,
        )
        return answer

    async def ingest_turn(self, query: str, answer: str = "", *, sync_markdown: bool = True) -> dict:
        await self.add_message(query, is_user=True)
        if answer.strip():
            await self.add_message(answer, is_user=False)
        await self.update_persona()
        out: dict = {"mode": "full_omem", "synced": []}
        if sync_markdown:
            persona = getattr(self._system.user_persona_memory, "preference_persona", "") or ""
            if persona:
                paths = sync_from_extraction(
                    {"preferences": [persona], "attributes": [], "events": []},
                    source="omem_full_bridge",
                )
                out["synced"] = [str(p) for p in paths]
            write_snapshot_cache()
        return out


def run_ingest_turn(query: str, answer: str = "", *, sync_markdown: bool = True) -> dict:
    """Entry: full O-Mem if available, else lightweight KeyShield extraction."""
    if is_omem_available() and get_async_openai_client():
        bridge = OMemBridge()
        return asyncio.run(bridge.ingest_turn(query, answer, sync_markdown=sync_markdown))
    from .lightweight import ingest_turn

    return ingest_turn(query, answer, sync_markdown=sync_markdown)


def bootstrap_from_markdown() -> dict:
    """Seed O-Mem cache snapshot from existing persona markdown."""
    snap = export_persona_snapshot()
    write_snapshot_cache()
    return snap
