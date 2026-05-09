"""
helius_laserstream — gRPC client for Helius LaserStream.

LaserStream uses the Yellowstone gRPC protocol (dragon's mouth). This module
wraps the generated stubs in a clean async iterator API so callers don't deal
with gRPC plumbing.

Setup (one-time):
    bash src/backend/skills/build_laserstream_proto.sh

That script fetches `geyser.proto` from the Yellowstone repo and compiles it
into `src/backend/skills/_laserstream_proto/` (gitignored). Until you run it,
imports below raise `LaserStreamProtoMissing`.

Endpoints:
    mainnet:  laserstream-mainnet.helius-rpc.com:443
    devnet:   laserstream-devnet.helius-rpc.com:443

Usage:
    async with LaserStream(api_key) as ls:
        sub = ls.subscribe_accounts(owner=["So111..."])
        async for update in sub:
            print(update)
"""

from __future__ import annotations

import asyncio
import logging
import os
from collections.abc import AsyncIterator
from typing import Any

logger = logging.getLogger(__name__)

_MAINNET = "laserstream-mainnet.helius-rpc.com:443"
_DEVNET = "laserstream-devnet.helius-rpc.com:443"


class LaserStreamProtoMissing(ImportError):
    """Generated gRPC stubs are not present. Run build_laserstream_proto.sh."""


def _import_stubs():
    try:
        from ._laserstream_proto import geyser_pb2, geyser_pb2_grpc  # type: ignore
        return geyser_pb2, geyser_pb2_grpc
    except ImportError as exc:
        raise LaserStreamProtoMissing(
            "Run `bash src/backend/skills/build_laserstream_proto.sh` to "
            "generate the Yellowstone gRPC stubs before using LaserStream."
        ) from exc


def _import_grpc():
    try:
        import grpc  # type: ignore
        import grpc.aio  # type: ignore
        return grpc
    except ImportError as exc:
        raise ImportError(
            "LaserStream requires grpcio: pip install grpcio>=1.60 grpcio-tools"
        ) from exc


class LaserStream:
    def __init__(self, api_key: str, *, network: str = "mainnet", endpoint: str | None = None):
        self.api_key = api_key
        if endpoint:
            self.endpoint = endpoint
        elif network == "devnet":
            self.endpoint = _DEVNET
        else:
            self.endpoint = _MAINNET
        self._channel = None
        self._stub = None

    async def __aenter__(self) -> "LaserStream":
        await self._connect()
        return self

    async def __aexit__(self, *exc) -> None:
        await self.close()

    async def _connect(self) -> None:
        grpc = _import_grpc()
        _pb, _pb_grpc = _import_stubs()
        # Helius requires bearer auth on every call; attach as metadata via
        # a per-call call_credentials composer.
        creds = grpc.ssl_channel_credentials()
        self._channel = grpc.aio.secure_channel(
            self.endpoint,
            creds,
            options=[
                ("grpc.keepalive_time_ms", 30_000),
                ("grpc.keepalive_timeout_ms", 10_000),
                ("grpc.max_receive_message_length", 64 * 1024 * 1024),
            ],
        )
        self._stub = _pb_grpc.GeyserStub(self._channel)

    async def close(self) -> None:
        if self._channel:
            await self._channel.close()
            self._channel = None
            self._stub = None

    def _md(self) -> list[tuple[str, str]]:
        # Helius LaserStream uses x-token (not Bearer). See Helius docs.
        return [("x-token", self.api_key)]

    # ─── high-level subscribe helpers ──────────────────────────────────────
    async def subscribe(self, request: Any) -> AsyncIterator[Any]:
        """
        Open a bidirectional Subscribe stream and return an async iterator
        of `SubscribeUpdate` messages.

        `request` must be a `geyser_pb2.SubscribeRequest`. Use the typed
        helpers below or build it manually.
        """
        if self._stub is None:
            raise RuntimeError("LaserStream not connected; use `async with`")
        # Send a single SubscribeRequest then read updates.
        async def _req_iter() -> AsyncIterator[Any]:
            yield request
        call = self._stub.Subscribe(_req_iter(), metadata=self._md())
        async for update in call:
            yield update

    def subscribe_accounts(
        self,
        *,
        owner: list[str] | None = None,
        account: list[str] | None = None,
        commitment: str = "confirmed",
    ) -> AsyncIterator[Any]:
        """Stream account updates filtered by owner program(s) and/or account pubkey(s)."""
        pb, _ = _import_stubs()
        req = pb.SubscribeRequest()
        f = pb.SubscribeRequestFilterAccounts()
        if owner: f.owner.extend(owner)
        if account: f.account.extend(account)
        req.accounts["client"].CopyFrom(f)
        req.commitment = _commitment_to_pb(pb, commitment)
        return self.subscribe(req)

    def subscribe_transactions(
        self,
        *,
        account_include: list[str] | None = None,
        account_required: list[str] | None = None,
        vote: bool = False,
        failed: bool = False,
        commitment: str = "confirmed",
    ) -> AsyncIterator[Any]:
        """Stream transactions filtered by accounts."""
        pb, _ = _import_stubs()
        req = pb.SubscribeRequest()
        f = pb.SubscribeRequestFilterTransactions()
        if account_include: f.account_include.extend(account_include)
        if account_required: f.account_required.extend(account_required)
        f.vote = vote
        f.failed = failed
        req.transactions["client"].CopyFrom(f)
        req.commitment = _commitment_to_pb(pb, commitment)
        return self.subscribe(req)

    def subscribe_slots(self, *, commitment: str = "confirmed") -> AsyncIterator[Any]:
        pb, _ = _import_stubs()
        req = pb.SubscribeRequest()
        req.slots["client"].CopyFrom(pb.SubscribeRequestFilterSlots())
        req.commitment = _commitment_to_pb(pb, commitment)
        return self.subscribe(req)

    def subscribe_blocks(
        self,
        *,
        account_include: list[str] | None = None,
        include_transactions: bool = True,
        commitment: str = "confirmed",
    ) -> AsyncIterator[Any]:
        pb, _ = _import_stubs()
        req = pb.SubscribeRequest()
        f = pb.SubscribeRequestFilterBlocks()
        if account_include: f.account_include.extend(account_include)
        f.include_transactions = include_transactions
        req.blocks["client"].CopyFrom(f)
        req.commitment = _commitment_to_pb(pb, commitment)
        return self.subscribe(req)


def _commitment_to_pb(pb, c: str) -> int:
    m = {"processed": pb.PROCESSED, "confirmed": pb.CONFIRMED, "finalized": pb.FINALIZED}
    if c not in m:
        raise ValueError(f"commitment must be one of {list(m)}, got {c!r}")
    return m[c]
