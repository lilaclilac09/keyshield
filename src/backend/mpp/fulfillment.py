"""Proof-of-fulfillment for MPP metering.

`mpp_settle` debits the stream escrow by `units × cost`. That debit is
only allowed after this module has checked the upstream response that
the units came from.

The preimage binds the stream, the provider, the HTTP status, and
`sha256(response body)`. The artifact hash is `sha256(preimage)`.
Settlement commits to `sha256` of the artifact hashes in the batch
(the artifact root). The on-chain instruction rejects a missing or
all-zero root, so a settle with no fulfillment commitment cannot move
USDC.

Rejected responses — and therefore not billable:

- non-2xx status
- empty or whitespace-only body
- JSON error envelopes with no successful payload
- non-JSON garbage (non-text bytes, or text with no substantive content)
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass

_SUCCESS_KEYS = (
    "choices",
    "candidates",
    "completion",
    "completions",
    "content",
    "data",
    "delta",
    "message",
    "messages",
    "output",
    "output_text",
    "response",
    "result",
    "results",
    "text",
)

_GARBAGE_TEXT = frozenset(
    {
        "error",
        "exception",
        "failed",
        "failure",
        "garbage",
        "nan",
        "none",
        "null",
        "undefined",
    }
)


class FulfillmentRejected(ValueError):
    """The upstream response is not something a stream may be billed for."""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


@dataclass(frozen=True)
class VerifiedArtifact:
    preimage: bytes
    artifact_hash: bytes
    body_sha256: bytes
    calls: int
    tokens: int


def sha256(data: bytes) -> bytes:
    return hashlib.sha256(data).digest()


def assert_settlement_artifact(
    digest: bytes | bytearray | str | None,
    *,
    what: str = "artifact hash",
) -> bytes:
    """Refuse settlement unless ``digest`` is 32 non-zero bytes.

    The proxy metering handler and ``settle_on_chain`` both call this
    before a capture MAC is accepted or an ``mpp_settle`` ix is built.
    A short, missing, or all-zero hash cannot reach the settler.
    """
    raw: bytes | bytearray | None
    if isinstance(digest, str):
        text = digest.strip().lower()
        if text.startswith("0x"):
            text = text[2:]
        try:
            raw = bytes.fromhex(text)
        except ValueError as exc:
            raise FulfillmentRejected(f"{what} must be 32 bytes") from exc
    else:
        raw = digest
    if not isinstance(raw, (bytes, bytearray)) or len(raw) != 32:
        raise FulfillmentRejected(f"{what} must be 32 bytes")
    if bytes(raw) == bytes(32):
        raise FulfillmentRejected(f"settlement requires a non-zero {what}")
    return bytes(raw)


def coerce_body(body: bytes | bytearray | str | dict | list) -> bytes:
    if isinstance(body, (bytes, bytearray)):
        return bytes(body)
    if isinstance(body, str):
        return body.encode("utf-8")
    if isinstance(body, (dict, list)):
        return json.dumps(body, separators=(",", ":"), sort_keys=True).encode("utf-8")
    raise FulfillmentRejected("response body must be bytes, str, or JSON")


def _looks_like_json(body: bytes, content_type: str | None) -> bool:
    ct = (content_type or "").lower()
    if "json" in ct:
        return True
    stripped = body.lstrip()
    return stripped.startswith(b"{") or stripped.startswith(b"[")


def _substantive(value: object) -> bool:
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, bool):
        return False
    if isinstance(value, (int, float)):
        return True
    if isinstance(value, list):
        return any(_substantive(item) for item in value)
    if isinstance(value, dict):
        return any(_substantive(item) for item in value.values())
    return False


def _is_error_envelope(obj: dict) -> bool:
    if "error" not in obj and "errors" not in obj:
        return False
    for key in _SUCCESS_KEYS:
        if key in obj and _substantive(obj[key]):
            return False
    return True


def _extract_tokens(obj: dict) -> int | None:
    usage = obj.get("usage")
    if not isinstance(usage, dict):
        return None
    if "total_tokens" in usage:
        try:
            return max(0, int(usage["total_tokens"]))
        except (TypeError, ValueError):
            return None
    prompt = usage.get("input_tokens", usage.get("prompt_tokens"))
    completion = usage.get("output_tokens", usage.get("completion_tokens"))
    if prompt is None and completion is None:
        return None
    try:
        return max(0, int(prompt or 0) + int(completion or 0))
    except (TypeError, ValueError):
        return None


def assess_response(
    status_code: int,
    body: bytes,
    content_type: str | None = None,
) -> dict | list | None:
    """Return parsed JSON when the body is JSON, else None.

    Raises FulfillmentRejected when the response must not be billed.
    """
    if isinstance(status_code, bool) or not isinstance(status_code, int):
        raise FulfillmentRejected("status_code must be an integer")
    if status_code < 200 or status_code >= 300:
        raise FulfillmentRejected("upstream error status")
    if not body or not body.strip():
        raise FulfillmentRejected("empty payload")

    if _looks_like_json(body, content_type):
        try:
            parsed = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise FulfillmentRejected("garbage payload") from exc
        if parsed is None or parsed == "" or parsed == [] or parsed == {}:
            raise FulfillmentRejected("empty payload")
        if isinstance(parsed, dict):
            if _is_error_envelope(parsed):
                raise FulfillmentRejected("error payload")
            has_success = any(key in parsed and _substantive(parsed[key]) for key in _SUCCESS_KEYS)
            if not has_success and not _substantive(parsed):
                raise FulfillmentRejected("empty payload")
            return parsed
        if isinstance(parsed, list):
            if not _substantive(parsed):
                raise FulfillmentRejected("empty payload")
            return parsed
        if isinstance(parsed, str):
            if parsed.strip().lower() in _GARBAGE_TEXT:
                raise FulfillmentRejected("garbage payload")
            return None
        raise FulfillmentRejected("garbage payload")

    ct = (content_type or "").lower()
    try:
        text = body.decode("utf-8")
    except UnicodeDecodeError:
        if ct.startswith(("image/", "audio/", "video/", "application/octet-stream")):
            return None
        raise FulfillmentRejected("garbage payload")
    stripped = text.strip()
    if stripped.lower() in _GARBAGE_TEXT or not any(ch.isalnum() for ch in stripped):
        raise FulfillmentRejected("garbage payload")
    return None


def _is_sse(body: bytes, content_type: str | None) -> bool:
    ct = (content_type or "").lower()
    if "text/event-stream" in ct:
        return True
    head = body.lstrip()[:16]
    return head.startswith(b"data:") or head.startswith(b"event:")


def _sse_usage_tokens(body: bytes) -> int | None:
    """Last `usage` object on an SSE `data:` line, if one was received."""
    try:
        text = body.decode("utf-8")
    except UnicodeDecodeError:
        return None
    found: int | None = None
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped.startswith("data:"):
            continue
        payload = stripped[5:].strip()
        if not payload or payload == "[DONE]":
            continue
        try:
            obj = json.loads(payload)
        except json.JSONDecodeError:
            continue
        if isinstance(obj, dict):
            tokens = _extract_tokens(obj)
            if tokens is not None:
                found = tokens
    return found


def received_token_ceiling(body: bytes) -> int:
    """Upper bound from bytes actually in hand: one token per four chars."""
    try:
        text = body.decode("utf-8")
    except UnicodeDecodeError:
        text = body.decode("utf-8", errors="replace")
    return max(0, len(text) // 4)


def checkpoint_tokens(
    body: bytes,
    parsed: dict | list | None,
    content_type: str | None,
    *,
    truncated: bool,
    proven: int | None,
) -> int | None:
    """Tokens to bill for a stream checkpoint.

    A completed SSE body uses the `usage` object on its `data:` lines.
    A truncated body bills `min(advertised usage, chars // 4)` and never
    the advertised total of a generation the socket did not deliver.
    Non-stream JSON returns `proven` unchanged.
    """
    sse = _is_sse(body, content_type)
    if not sse and not truncated:
        return proven
    advertised = _sse_usage_tokens(body)
    if advertised is None and isinstance(parsed, dict):
        advertised = _extract_tokens(parsed)
    if advertised is None:
        advertised = proven
    ceiling = received_token_ceiling(body)
    if truncated:
        if advertised is None:
            return ceiling
        return min(int(advertised), ceiling)
    if advertised is not None:
        return int(advertised)
    return ceiling


def billable_units(
    parsed: dict | list | None,
    *,
    claimed_calls: int,
    claimed_tokens: int,
    observed: bool,
) -> tuple[int, int]:
    """Cap client-claimed units at what the payload actually proves.

    `observed=True` is the proxy path: the server saw the bytes, so a
    successful response is one call plus whatever `usage` the body
    reports. Client claims cannot increase that.
    """
    if isinstance(claimed_calls, bool) or isinstance(claimed_tokens, bool):
        raise FulfillmentRejected("calls and tokens must be non-negative integers")
    if claimed_calls < 0 or claimed_tokens < 0:
        raise FulfillmentRejected("calls and tokens must be non-negative")

    proven = _extract_tokens(parsed) if isinstance(parsed, dict) else None
    if observed:
        calls = 1
        tokens = proven or 0
        return calls, tokens

    if claimed_calls == 0 and claimed_tokens == 0:
        raise FulfillmentRejected("nothing billable in payload")
    calls = 1 if claimed_calls > 0 else 0
    if claimed_tokens > 0:
        if proven is None:
            raise FulfillmentRejected("no token proof in payload")
        tokens = min(int(claimed_tokens), proven)
        if tokens == 0:
            raise FulfillmentRejected("no token proof in payload")
    else:
        tokens = 0
    if calls == 0 and tokens == 0:
        raise FulfillmentRejected("nothing billable in payload")
    return calls, tokens


def canonical_preimage(
    *,
    stream_id: int,
    upstream: str,
    status_code: int,
    body: bytes,
    calls: int,
    tokens: int,
) -> bytes:
    upstream_b = upstream.encode("utf-8")
    if len(upstream_b) > 0xFFFF:
        raise FulfillmentRejected("upstream name too long")
    return (
        int(stream_id).to_bytes(8, "little")
        + len(upstream_b).to_bytes(2, "little")
        + upstream_b
        + int(status_code).to_bytes(2, "little")
        + sha256(body)
        + int(calls).to_bytes(8, "little")
        + int(tokens).to_bytes(8, "little")
    )


def verify_fulfillment(
    *,
    stream_id: int,
    upstream: str,
    status_code: int,
    body: bytes | bytearray | str | dict | list,
    content_type: str | None = None,
    claimed_calls: int = 0,
    claimed_tokens: int = 0,
    observed: bool = False,
    truncated: bool = False,
) -> VerifiedArtifact:
    raw = coerce_body(body)
    if truncated and (not raw or not raw.strip()):
        raise FulfillmentRejected("empty payload")
    parsed = assess_response(status_code, raw, content_type)
    calls, tokens = billable_units(
        parsed,
        claimed_calls=claimed_calls,
        claimed_tokens=claimed_tokens,
        observed=observed,
    )
    proven = _extract_tokens(parsed) if isinstance(parsed, dict) else None
    checkpoint = checkpoint_tokens(
        raw,
        parsed,
        content_type,
        truncated=truncated,
        proven=proven if proven is not None else tokens,
    )
    if checkpoint is not None and (_is_sse(raw, content_type) or truncated):
        tokens = checkpoint
        if observed and calls == 0 and tokens > 0:
            calls = 1
    preimage = canonical_preimage(
        stream_id=stream_id,
        upstream=upstream,
        status_code=status_code,
        body=raw,
        calls=calls,
        tokens=tokens,
    )
    artifact_hash = assert_settlement_artifact(sha256(preimage))
    body_sha256 = assert_settlement_artifact(sha256(raw), what="body hash")
    return VerifiedArtifact(
        preimage=preimage,
        artifact_hash=artifact_hash,
        body_sha256=body_sha256,
        calls=calls,
        tokens=tokens,
    )


def artifact_root(hashes: list[bytes]) -> bytes:
    """Commitment over the fulfillment hashes in a settlement batch."""
    if not hashes:
        raise FulfillmentRejected("no artifacts to settle")
    for digest in hashes:
        if len(digest) != 32:
            raise FulfillmentRejected("artifact hash must be 32 bytes")
    root = sha256(b"".join(hashes))
    if root == bytes(32):
        raise FulfillmentRejected("artifact root is empty")
    return root
