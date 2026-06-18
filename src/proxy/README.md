Hot-path Rust proxy for calling upstream providers with scoped session tokens instead of raw provider secrets.

## Routes

- `ANY /proxy/{upstream}/{path}` — forward to an upstream with the vaulted key injected (specs 04, 05)
- `POST /manage/batch` — fan out up to 20 proxied calls (spec 06)
- `POST /agent/execute` — run a Claude Code coding turn under a vaulted Anthropic key; scope-gated (`agent:exec`) and jailed to `KS_AGENT_WORKSPACE_ROOT` (spec 19)
- `GET /health`, `GET /metrics`

Design specs live in [`specs/`](specs/). Run the proxy tests with
`cargo test --manifest-path Cargo.toml`.
