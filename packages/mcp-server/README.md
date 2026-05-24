# KeyShield MCP Server

Manage your KeyShield vault and agents directly from Claude.

## Install

```bash
pip install keyshield-mcp
```

## Configure in Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "keyshield": {
      "command": "keyshield-mcp",
      "env": {
        "KS_TOKEN": "ksv2_your_session_token",
        "KS_BASE": "https://app.ks.aileena.xyz"
      }
    }
  }
}
```

Get your `KS_TOKEN` from the KeyShield dashboard → Developer Token.

## Tools

| Tool | What it does |
|---|---|
| `list_vault` | List configured providers (no raw keys) |
| `list_sessions` | Show active tokens |
| `revoke_session` | Kill a session immediately |
| `list_agents` | Show registered AI agents |
| `revoke_agent` | Revoke an agent's access immediately |
| `vault_status` | Check backend connectivity |

## Example

> "Show me all active sessions and revoke anything older than today"

Claude calls `list_sessions()`, identifies stale tokens, calls `revoke_session(token_prefix)` for each — without you touching the dashboard.
