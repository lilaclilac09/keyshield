#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# keyshield-cli.sh — KeyShield v2 shell client
#
# Usage:
#   keyshield-cli.sh login    <userId> <password>
#   keyshield-cli.sh wlogin   <walletAddress> <signature_b64> <challenge> <passphrase>
#   keyshield-cli.sh logout
#   keyshield-cli.sh store    <upstream> <apiKey>
#   keyshield-cli.sh list
#   keyshield-cli.sh delete   <upstream>
#   keyshield-cli.sh proxy    <upstream> <path> [json_body]
#   keyshield-cli.sh health
#   keyshield-cli.sh challenge
#
# Token is stored in ~/.keyshield/token (mode 600).
# Set KS_BASE to override the API URL (default: http://localhost:8000).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

KS_BASE="${KS_BASE:-http://localhost:8000}"
KS_DIR="$HOME/.keyshield"
TOKEN_FILE="$KS_DIR/token"

# ── helpers ───────────────────────────────────────────────────────────────────

_ensure_dir() {
  mkdir -p "$KS_DIR"
  chmod 700 "$KS_DIR"
}

_load_token() {
  if [[ -f "$TOKEN_FILE" ]]; then
    cat "$TOKEN_FILE"
  else
    echo ""
  fi
}

_save_token() {
  _ensure_dir
  echo -n "$1" > "$TOKEN_FILE"
  chmod 600 "$TOKEN_FILE"
}

_clear_token() {
  rm -f "$TOKEN_FILE"
}

_require_token() {
  local tok
  tok=$(_load_token)
  if [[ -z "$tok" ]]; then
    echo "❌  Not logged in. Run: $0 login <userId> <password>" >&2
    exit 1
  fi
  echo "$tok"
}

_post() {
  local path="$1"
  local body="$2"
  curl -sS -X POST \
    -H "Content-Type: application/json" \
    -d "$body" \
    "${KS_BASE}${path}"
}

_auth_post() {
  local path="$1"
  local body="${2}"
  [[ -z "$body" ]] && body='{}'
  local tok
  tok=$(_require_token)
  curl -sS -X POST \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${tok}" \
    -d "$body" \
    "${KS_BASE}${path}"
}

_auth_get() {
  local path="$1"
  local tok
  tok=$(_require_token)
  curl -sS -X GET \
    -H "Authorization: Bearer ${tok}" \
    "${KS_BASE}${path}"
}

_auth_delete() {
  local path="$1"
  local tok
  tok=$(_require_token)
  curl -sS -X DELETE \
    -H "Authorization: Bearer ${tok}" \
    "${KS_BASE}${path}"
}

_pretty() {
  # Pretty-print JSON if jq is available, else raw
  if command -v jq &>/dev/null; then
    echo "$1" | jq .
  else
    echo "$1"
  fi
}

# ── commands ──────────────────────────────────────────────────────────────────

cmd_login() {
  local userId="${1:?Usage: login <userId> <password>}"
  local password="${2:?Usage: login <userId> <password>}"
  local resp
  resp=$(_post "/auth/login" "{\"userId\":\"$userId\",\"password\":\"$password\"}")
  local token
  token=$(echo "$resp" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
  if [[ -z "$token" ]]; then
    echo "❌  Login failed:" >&2
    _pretty "$resp" >&2
    exit 1
  fi
  _save_token "$token"
  echo "✅  Logged in as $userId"
  echo "    Token saved to $TOKEN_FILE"
}

cmd_wlogin() {
  local walletAddress="${1:?Usage: wlogin <walletAddress> <signature_b64> <challenge> <passphrase>}"
  local signature="${2:?}"
  local challenge="${3:?}"
  local passphrase="${4:?}"
  local body
  body=$(printf '{"walletAddress":"%s","signature":"%s","challenge":"%s","passphrase":"%s"}' \
    "$walletAddress" "$signature" "$challenge" "$passphrase")
  local resp
  resp=$(_post "/auth/wallet-login" "$body")
  local token
  token=$(echo "$resp" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
  if [[ -z "$token" ]]; then
    echo "❌  Wallet login failed:" >&2
    _pretty "$resp" >&2
    exit 1
  fi
  _save_token "$token"
  echo "✅  Wallet authenticated: $walletAddress"
  echo "    Token saved to $TOKEN_FILE"
}

cmd_challenge() {
  local resp
  resp=$(curl -sS "${KS_BASE}/auth/wallet-challenge")
  _pretty "$resp"
}

cmd_logout() {
  local tok
  tok=$(_load_token)
  if [[ -n "$tok" ]]; then
    curl -sS -X POST \
      -H "Authorization: Bearer ${tok}" \
      "${KS_BASE}/auth/logout" > /dev/null 2>&1 || true
  fi
  _clear_token
  echo "✅  Logged out"
}

cmd_store() {
  local upstream="${1:?Usage: store <upstream> <apiKey>}"
  local apiKey="${2:?Usage: store <upstream> <apiKey>}"
  local resp
  resp=$(_auth_post "/manage/store" "{\"upstream\":\"$upstream\",\"apiKey\":\"$apiKey\"}")
  _pretty "$resp"
}

cmd_list() {
  local resp
  resp=$(_auth_get "/manage/list")
  _pretty "$resp"
}

cmd_delete() {
  local upstream="${1:?Usage: delete <upstream>}"
  local resp
  resp=$(_auth_delete "/manage/secret/${upstream}")
  _pretty "$resp"
}

cmd_proxy() {
  local upstream="${1:?Usage: proxy <upstream> <path> [json_body]}"
  local path="${2:?Usage: proxy <upstream> <path> [json_body]}"
  local body="${3:-}"
  local tok
  tok=$(_require_token)
  if [[ -n "$body" ]]; then
    curl -sS -X POST \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${tok}" \
      -d "$body" \
      "${KS_BASE}/proxy/${upstream}/${path}"
  else
    curl -sS -X GET \
      -H "Authorization: Bearer ${tok}" \
      "${KS_BASE}/proxy/${upstream}/${path}"
  fi
}

cmd_health() {
  local resp
  resp=$(curl -sS "${KS_BASE}/health")
  _pretty "$resp"
}

cmd_help() {
  cat <<EOF
KeyShield CLI v2 — API Key Vault + Zero-Trust Proxy

USAGE:
  keyshield-cli.sh <command> [args]

COMMANDS:
  login     <userId> <password>               Password-based login
  wlogin    <wallet> <sig_b64> <ch> <pass>    Wallet signature login
  challenge                                   Get a wallet challenge nonce
  logout                                      End session
  store     <upstream> <apiKey>               Encrypt & store an API key
  list                                        List stored upstreams
  delete    <upstream>                        Remove a stored key
  proxy     <upstream> <path> [body]          Proxy a request through the vault
  health                                      Backend health check

ENVIRONMENT:
  KS_BASE   API base URL (default: http://localhost:8000)

EXAMPLES:
  # Password login
  ./keyshield-cli.sh login myuser mypassphrase

  # Store OpenAI key (encrypted)
  ./keyshield-cli.sh store openai sk-proj-xxxxxxx

  # Proxy an OpenAI chat request
  ./keyshield-cli.sh proxy openai v1/chat/completions \\
    '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"ping"}]}'

  # Wallet auth (advanced — use the frontend instead)
  CHALLENGE=\$(./keyshield-cli.sh challenge | jq -r .challenge)
  # sign \$CHALLENGE with your wallet, get SIG_B64
  ./keyshield-cli.sh wlogin <address> <SIG_B64> "\$CHALLENGE" mypassphrase
EOF
}

# ── dispatch ──────────────────────────────────────────────────────────────────

CMD="${1:-help}"
shift 2>/dev/null || true

case "$CMD" in
  login)     cmd_login "$@" ;;
  wlogin)    cmd_wlogin "$@" ;;
  challenge) cmd_challenge "$@" ;;
  logout)    cmd_logout "$@" ;;
  store)     cmd_store "$@" ;;
  list)      cmd_list "$@" ;;
  delete)    cmd_delete "$@" ;;
  proxy)     cmd_proxy "$@" ;;
  health)    cmd_health "$@" ;;
  help|--help|-h) cmd_help ;;
  *) echo "Unknown command: $CMD. Run '$0 help'" >&2; exit 1 ;;
esac
