"""
helius_ws — async client for Helius WebSocket subscriptions.

Wraps the standard Solana JSON-RPC pubsub endpoint exposed by Helius at
`wss://mainnet.helius-rpc.com/?api-key=<KEY>` plus Helius's Atlas-only
`transactionSubscribe`.

Design:
- One `HeliusWS` instance owns one WebSocket connection.
- Each `subscribe_*` returns an async iterator yielding decoded notifications
  until the caller breaks out or calls `unsubscribe`.
- Reconnects with exponential backoff; resubscribes all live subs on reconnect
  so callers don't need to handle disconnects.

Coverage (closes spec 09 Phase 5b):
  account_subscribe, signature_subscribe, program_subscribe,
  logs_subscribe, slot_subscribe, transaction_subscribe (Atlas).
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any, Callable

import websockets
from websockets.asyncio.client import ClientConnection

logger = logging.getLogger(__name__)

_RPC_WS = "wss://mainnet.helius-rpc.com"
_ATLAS_WS = "wss://atlas-mainnet.helius-rpc.com"


class HeliusWS:
    def __init__(self, api_key: str, *, atlas: bool = False, ping_interval: float = 20.0):
        base = _ATLAS_WS if atlas else _RPC_WS
        self._url = f"{base}/?api-key={api_key}"
        self._ping_interval = ping_interval
        self._next_id = 1
        self._pending: dict[int, asyncio.Future[Any]] = {}
        # sub_id (server-assigned) -> queue of notifications
        self._subs: dict[int, asyncio.Queue[dict]] = {}
        # client_id -> (method, params) so we can resubscribe on reconnect
        self._resub: dict[int, tuple[str, list]] = {}
        # client_id -> server sub_id (filled after `subscribe` round-trip)
        self._sub_handle: dict[int, int] = {}
        self._ws: ClientConnection | None = None
        self._reader_task: asyncio.Task | None = None
        self._closed = False

    # ─── lifecycle ─────────────────────────────────────────────────────────
    async def __aenter__(self) -> "HeliusWS":
        await self._connect()
        return self

    async def __aexit__(self, *exc) -> None:
        await self.close()

    async def _connect(self) -> None:
        self._ws = await websockets.connect(
            self._url,
            ping_interval=self._ping_interval,
            max_size=2**24,  # 16 MB — Helius can return chunky logs
        )
        self._reader_task = asyncio.create_task(self._reader())

    async def close(self) -> None:
        self._closed = True
        if self._reader_task:
            self._reader_task.cancel()
        if self._ws:
            await self._ws.close()

    # ─── reader: dispatches results vs notifications ──────────────────────
    async def _reader(self) -> None:
        backoff = 1.0
        while not self._closed:
            try:
                assert self._ws is not None
                async for raw in self._ws:
                    msg = json.loads(raw)
                    # Notification: {"method": "...Notification", "params": {"subscription": <int>, "result": ...}}
                    if "method" in msg and msg["method"].endswith("Notification"):
                        sub_id = msg["params"]["subscription"]
                        q = self._subs.get(sub_id)
                        if q is not None:
                            await q.put(msg["params"]["result"])
                        continue
                    # Response: {"id": <int>, "result": <int|bool>, "error": ...}
                    rid = msg.get("id")
                    fut = self._pending.pop(rid, None)
                    if fut and not fut.done():
                        if "error" in msg:
                            fut.set_exception(RuntimeError(msg["error"]))
                        else:
                            fut.set_result(msg.get("result"))
                backoff = 1.0  # clean exit; loop ends
            except Exception as exc:  # noqa: BLE001
                if self._closed:
                    return
                logger.warning("helius_ws disconnected: %s; reconnecting in %.1fs", exc, backoff)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30.0)
                try:
                    await self._reconnect()
                except Exception as e:  # noqa: BLE001
                    logger.warning("helius_ws reconnect failed: %s", e)

    async def _reconnect(self) -> None:
        if self._ws:
            try:
                await self._ws.close()
            except Exception:  # noqa: BLE001
                pass
        await self._connect()
        # Re-issue every prior subscription. Server-side sub_ids will change;
        # update _subs/_sub_handle accordingly.
        old = list(self._resub.items())
        self._resub.clear()
        old_handle_to_queue = {h: self._subs.pop(h) for cid, h in self._sub_handle.items() if h in self._subs}
        self._sub_handle.clear()
        for cid, (method, params) in old:
            new_sub_id = await self._call(method, params)
            self._sub_handle[cid] = new_sub_id
            # reuse the original queue so existing iterators keep working
            self._subs[new_sub_id] = old_handle_to_queue.get(cid, asyncio.Queue())
            self._resub[cid] = (method, params)

    # ─── low-level call ────────────────────────────────────────────────────
    async def _call(self, method: str, params: list) -> Any:
        assert self._ws is not None
        rid = self._next_id
        self._next_id += 1
        loop = asyncio.get_event_loop()
        fut: asyncio.Future = loop.create_future()
        self._pending[rid] = fut
        await self._ws.send(json.dumps({"jsonrpc": "2.0", "id": rid, "method": method, "params": params}))
        return await fut

    # ─── subscription primitive ────────────────────────────────────────────
    async def _subscribe(self, sub_method: str, unsub_method: str, params: list) -> AsyncIterator[dict]:
        cid = self._next_id  # we'll use the *first* request id as our client handle
        sub_id: int = await self._call(sub_method, params)
        self._sub_handle[cid] = sub_id
        self._resub[cid] = (sub_method, params)
        q: asyncio.Queue[dict] = asyncio.Queue()
        self._subs[sub_id] = q

        async def _iter() -> AsyncIterator[dict]:
            try:
                while True:
                    yield await q.get()
            finally:
                # caller broke out — best-effort unsubscribe
                live_sub = self._sub_handle.pop(cid, None)
                self._resub.pop(cid, None)
                if live_sub is not None:
                    self._subs.pop(live_sub, None)
                    try:
                        await self._call(unsub_method, [live_sub])
                    except Exception:  # noqa: BLE001
                        pass

        return _iter()

    # ─── high-level wrappers ───────────────────────────────────────────────
    async def account_subscribe(self, address: str, *, encoding: str = "jsonParsed", commitment: str = "confirmed") -> AsyncIterator[dict]:
        return await self._subscribe(
            "accountSubscribe", "accountUnsubscribe",
            [address, {"encoding": encoding, "commitment": commitment}],
        )

    async def signature_subscribe(self, signature: str, *, commitment: str = "confirmed") -> AsyncIterator[dict]:
        return await self._subscribe(
            "signatureSubscribe", "signatureUnsubscribe",
            [signature, {"commitment": commitment, "enableReceivedNotification": False}],
        )

    async def program_subscribe(self, program_id: str, *, encoding: str = "jsonParsed", commitment: str = "confirmed", filters: list | None = None) -> AsyncIterator[dict]:
        opts: dict = {"encoding": encoding, "commitment": commitment}
        if filters:
            opts["filters"] = filters
        return await self._subscribe(
            "programSubscribe", "programUnsubscribe",
            [program_id, opts],
        )

    async def logs_subscribe(self, mentions: list[str] | str = "all", *, commitment: str = "confirmed") -> AsyncIterator[dict]:
        # mentions: "all" | "allWithVotes" | {"mentions": [pubkey, ...]}
        filt: Any = mentions if isinstance(mentions, str) else {"mentions": mentions}
        return await self._subscribe(
            "logsSubscribe", "logsUnsubscribe",
            [filt, {"commitment": commitment}],
        )

    async def slot_subscribe(self) -> AsyncIterator[dict]:
        return await self._subscribe("slotSubscribe", "slotUnsubscribe", [])

    async def transaction_subscribe(self, *, account_include: list[str] | None = None, account_required: list[str] | None = None, vote: bool = False, failed: bool = False, commitment: str = "confirmed", encoding: str = "jsonParsed") -> AsyncIterator[dict]:
        """
        Helius Atlas-only: full enriched transaction stream filtered by accounts.
        Construct HeliusWS(..., atlas=True) for this method.
        """
        filt: dict = {"vote": vote, "failed": failed}
        if account_include: filt["accountInclude"] = account_include
        if account_required: filt["accountRequired"] = account_required
        opts: dict = {"commitment": commitment, "encoding": encoding, "transactionDetails": "full", "showRewards": False, "maxSupportedTransactionVersion": 0}
        return await self._subscribe(
            "transactionSubscribe", "transactionUnsubscribe",
            [filt, opts],
        )


# ─── convenience: one-shot helpers ─────────────────────────────────────────

@asynccontextmanager
async def open_ws(api_key: str, *, atlas: bool = False) -> AsyncIterator[HeliusWS]:
    """`async with open_ws(key) as ws: ...`"""
    async with HeliusWS(api_key, atlas=atlas) as ws:
        yield ws


async def watch_account(api_key: str, address: str, on_update: Callable[[dict], Any], *, max_events: int | None = None) -> None:
    """Convenience: stream account updates and dispatch to `on_update`."""
    n = 0
    async with HeliusWS(api_key) as ws:
        stream = await ws.account_subscribe(address)
        async for ev in stream:
            res = on_update(ev)
            if asyncio.iscoroutine(res):
                await res
            n += 1
            if max_events is not None and n >= max_events:
                return
