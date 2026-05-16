"""KeyShield MCP Server — vault and agent management tools for Claude."""

import os
import httpx
from mcp.server.fastmcp import FastMCP

_BASE = os.environ.get("KS_BASE", "http://localhost:8001").rstrip("/")
_TOKEN = os.environ.get("KS_TOKEN", "")

mcp = FastMCP("keyshield")


def _headers() -> dict:
    if not _TOKEN:
        raise ValueError("KS_TOKEN is not set. Export KS_TOKEN=<your session token>.")
    return {"Authorization": f"Bearer {_TOKEN}"}


def _get(path: str) -> dict:
    with httpx.Client(timeout=10) as c:
        r = c.get(f"{_BASE}{path}", headers=_headers())
        r.raise_for_status()
        return r.json()


def _delete(path: str) -> dict:
    with httpx.Client(timeout=10) as c:
        r = c.delete(f"{_BASE}{path}", headers=_headers())
        r.raise_for_status()
        return r.json()


def _post(path: str, body: dict) -> dict:
    with httpx.Client(timeout=10) as c:
        r = c.post(f"{_BASE}{path}", json=body, headers=_headers())
        r.raise_for_status()
        return r.json()


@mcp.tool()
def list_vault() -> str:
    """List all API providers stored in the KeyShield vault.

    Returns provider names and IDs — never raw API keys.
    Use this to see which upstream services (OpenAI, Anthropic, Helius, …)
    have credentials stored.
    """
    data = _get("/manage/vault")
    items = data if isinstance(data, list) else data.get("items", [])
    if not items:
        return "Vault is empty. No provider keys have been stored yet."
    lines = ["Vault contents (provider names only — no raw keys):\n"]
    for item in items:
        provider = item.get("upstream") or item.get("provider") or item.get("label", "?")
        item_id = item.get("id", "?")
        lines.append(f"  • {provider}  (id: {item_id})")
    return "\n".join(lines)


@mcp.tool()
def list_sessions() -> str:
    """List all active session tokens for the current user.

    Shows token prefix, creation time, and last-used info so you can
    identify and revoke specific sessions.
    """
    data = _get("/sessions")
    sessions = data if isinstance(data, list) else data.get("sessions", [])
    if not sessions:
        return "No active sessions."
    lines = ["Active sessions:\n"]
    for s in sessions:
        prefix = s.get("token_prefix") or s.get("prefix", "?")
        created = s.get("created_at", "?")
        label = s.get("label") or s.get("device") or ""
        line = f"  • {prefix}  created: {created}"
        if label:
            line += f"  ({label})"
        lines.append(line)
    return "\n".join(lines)


@mcp.tool()
def revoke_session(token_prefix: str) -> str:
    """Revoke an active session token immediately.

    The token becomes invalid on the next request — no TTL lag.
    Use list_sessions() first to find the token prefix.

    Args:
        token_prefix: The prefix of the token to revoke (from list_sessions).
    """
    _delete(f"/sessions/{token_prefix}")
    return f"Session {token_prefix!r} revoked. Any agent using this token will receive 401 on its next request."


@mcp.tool()
def list_agents() -> str:
    """List all registered AI agents and their access grants.

    Shows each agent's ID, name, allowed providers, and spending cap.
    """
    data = _get("/agents")
    agents = data if isinstance(data, list) else data.get("agents", [])
    if not agents:
        return "No agents registered."
    lines = ["Registered agents:\n"]
    for a in agents:
        agent_id = a.get("agent_id") or a.get("id", "?")
        name = a.get("name") or a.get("label", "unnamed")
        cap = a.get("spend_cap_usd")
        cap_str = f"  spend cap: ${cap}" if cap is not None else ""
        lines.append(f"  • [{agent_id}] {name}{cap_str}")
    return "\n".join(lines)


@mcp.tool()
def revoke_agent(agent_id: str) -> str:
    """Revoke an agent's access immediately.

    Deletes the agent registration. The agent's token will return 401
    on its next request. Use list_agents() to find the agent ID.

    Args:
        agent_id: The ID of the agent to revoke (from list_agents).
    """
    _delete(f"/agents/{agent_id}")
    return f"Agent {agent_id!r} revoked. Its credentials are no longer valid."


@mcp.tool()
def vault_status() -> str:
    """Check if the KeyShield backend is reachable and healthy."""
    try:
        data = _get("/health")
        status = data.get("status", "ok")
        return f"KeyShield backend is up. Status: {status}  Base: {_BASE}"
    except httpx.ConnectError:
        return f"Cannot reach KeyShield backend at {_BASE}. Is the server running?"
    except httpx.HTTPStatusError as e:
        return f"Backend returned {e.response.status_code}. Check KS_TOKEN."


def main() -> None:
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
