#!/usr/bin/env bash
# KeyShield CLI — source this file, or: curl -fsSL "$KS_BASE/install.sh"
#
# Live FastAPI is on :8001. Password login is 403; set KS_TOKEN from the
# dashboard / wallet-login, then ks_store / ks_list / ks_proxy.

set -euo pipefail

KS_BASE="${KS_BASE:-http://localhost:8001}"
KS_TOKEN_FILE="${KS_TOKEN_FILE:-$HOME/.keyshield/token}"

_ks_token() {
  if [[ -n "${KS_TOKEN:-}" ]]; then
    printf '%s' "$KS_TOKEN"
    return
  fi
  if [[ -f "$KS_TOKEN_FILE" ]]; then
    tr -d '\n' < "$KS_TOKEN_FILE"
  fi
}

_ks_auth() {
  local t
  t="$(_ks_token)"
  if [[ -z "$t" ]]; then
    echo "no session token. export KS_TOKEN or run ks_login after wallet-login." >&2
    return 1
  fi
  printf 'Authorization: Bearer %s' "$t"
}

ks_health() {
  curl -fsS "$KS_BASE/health"
  echo
}

ks_login() {
  echo "direct /auth/login is disabled (403)." >&2
  echo "Get a token via wallet or passkey, then:" >&2
  echo "  export KS_TOKEN=ksv2_..." >&2
  echo "  mkdir -p ~/.keyshield && printf '%s' \"\$KS_TOKEN\" > ~/.keyshield/token" >&2
  return 1
}

ks_store() {
  local upstream="${1:?usage: ks_store <upstream> <api_key>}"
  local key="${2:?usage: ks_store <upstream> <api_key>}"
  curl -fsS -X POST "$KS_BASE/manage/store" \
    -H "$(_ks_auth)" \
    -H 'Content-Type: application/json' \
    -d "{\"upstream\":\"$upstream\",\"value\":\"$key\",\"apiKey\":\"$key\"}"
  echo
}

ks_list() {
  curl -fsS "$KS_BASE/manage/list" -H "$(_ks_auth)"
  echo
}

ks_delete() {
  local upstream="${1:?usage: ks_delete <upstream>}"
  curl -fsS -X DELETE "$KS_BASE/manage/secret/$upstream" -H "$(_ks_auth)"
  echo
}

ks_proxy() {
  local upstream="${1:?usage: ks_proxy <upstream> <path> [json]}"
  local path="${2:?usage: ks_proxy <upstream> <path> [json]}"
  local json="${3:-}"
  local hdrs=("$(_ks_auth)")
  if [[ -n "${KS_UPSTREAM_API_KEY:-}" ]]; then
    hdrs+=("X-Upstream-API-Key: $KS_UPSTREAM_API_KEY")
  fi
  if [[ -n "$json" ]]; then
    curl -fsS -X POST "$KS_BASE/proxy/$upstream/$path" \
      -H "${hdrs[0]}" ${hdrs[1]:+-H "${hdrs[1]}"} \
      -H 'Content-Type: application/json' \
      -d "$json"
  else
    curl -fsS "$KS_BASE/proxy/$upstream/$path" \
      -H "${hdrs[0]}" ${hdrs[1]:+-H "${hdrs[1]}"}
  fi
  echo
}

ks_logout() {
  local t
  t="$(_ks_token)"
  if [[ -n "$t" ]]; then
    curl -fsS -X POST "$KS_BASE/auth/logout" -H "Authorization: Bearer $t" >/dev/null || true
  fi
  rm -f "$KS_TOKEN_FILE"
  unset KS_TOKEN
  echo "logged out"
}

if [[ "${BASH_SOURCE[0]:-}" == "$0" ]]; then
  mkdir -p "$HOME/.keyshield"
  dest="${KS_CLI_INSTALL:-$HOME/.keyshield/keyshield-cli.sh}"
  if [[ -r "$0" && "$0" != "bash" && "$0" != "-" ]]; then
    cp "$0" "$dest"
  else
    cat > "$dest"
  fi
  echo "KeyShield CLI installed to $dest"
  echo "Add to ~/.bashrc:  source $dest"
  echo "Then: export KS_BASE=$KS_BASE   export KS_TOKEN=ksv2_..."
fi
