"""Scoped agent-token checks used by the Python proxy."""

from __future__ import annotations

from typing import Any


_HELIUS_ALIASES = {"helius", "helius-rpc", "helius-das", "helius-enhanced"}


def parse_scope_list(raw: Any) -> list[str]:
    if raw is None or raw == "":
        return ["*"]
    if isinstance(raw, list):
        items = [str(x).strip() for x in raw if str(x).strip()]
        return items or ["*"]
    text = str(raw).strip()
    if text in ("*", "all"):
        return ["*"]
    items = [p.strip() for p in text.split(",") if p.strip()]
    return items or ["*"]


def _upstream_matches(constraint: str, upstream: str) -> bool:
    c = constraint.strip().lower()
    u = upstream.strip().lower()
    if c in ("*", "all"):
        return True
    if c == u:
        return True
    if c == "helius" and u in _HELIUS_ALIASES:
        return True
    return False


def _is_path_scope(item: str) -> bool:
    """Path-level ACL items must look like a path, not a free substring.

    ``openai`` matches the upstream. ``/v1/chat`` or ``chat.completions`` or
    ``helius:getBalance`` match inside the request path. A bare token like
    ``v1`` does **not** match every path that happens to contain those
    letters — that was the old loophole.
    """
    return any(ch in item for ch in "/.:")


def scope_allows(scopes: list[str], upstream: str, path: str) -> bool:
    if not scopes or "*" in scopes:
        return True
    path_l = f"/{path.lstrip('/')}".lower()
    for item in scopes:
        if _upstream_matches(item, upstream):
            return True
        needle = item.strip().lower()
        if needle and _is_path_scope(needle) and needle in path_l:
            return True
    return False


def check_proxy_access(sess: dict | None, upstream: str, path: str) -> tuple[bool, str | None, int]:
    """Return (ok, error, http_status). Anonymous / missing session is allowed."""
    if not sess:
        return True, None, 200

    aid = sess.get("aid")
    if aid is not None:
        from ..agents import agents as agents_mod

        try:
            revoked = agents_mod.is_revoked(int(aid))
        except (TypeError, ValueError):
            revoked = True
        if revoked:
            return False, "agent revoked", 401

    provider = sess.get("provider")
    if provider and not _upstream_matches(str(provider), upstream):
        return False, f"token scoped to provider {provider}", 403

    raw_scope = sess.get("scope")
    if raw_scope is not None:
        if not scope_allows(parse_scope_list(raw_scope), upstream, path):
            return False, "token scope does not allow this upstream", 403

    cap = sess.get("spend_cap_usd")
    if cap is not None and cap != "":
        try:
            cap_f = float(cap)
        except (TypeError, ValueError):
            cap_f = None
        if cap_f is not None:
            from ..billing import usage as usage_mod

            agent_id = None
            try:
                if aid is not None:
                    agent_id = int(aid)
            except (TypeError, ValueError):
                agent_id = None
            spent = usage_mod.spent_usd(
                user_id=sess.get("user_id") or "",
                agent_id=agent_id,
                since=sess.get("iat"),
            )
            if spent >= cap_f:
                return False, "spend cap exceeded", 429
    return True, None, 200
