#!/usr/bin/env bash
#
# KeyShield one-click installer
# ─────────────────────────────────────────────────────────────────────────────
# Downloads the SDK, creates a Python venv, generates an agent ed25519 keypair,
# and writes a ready-to-use .env file.
#
# Usage:
#   curl -fsSL http://localhost:8000/install.sh | bash
#   # or
#   bash install.sh
#
# Environment variables (optional, prompted if missing):
#   KS_BASE          KeyShield server URL          (default: http://localhost:8000)
#   KS_OWNER_WALLET  Your Solana wallet address    (required for agent auth)
#   KS_VAULT_PASS    Your vault passphrase         (required)
#   KS_AGENT_NAME    Label for this agent          (default: hostname-agent)
#   KS_INSTALL_DIR   Where to install              (default: ./keyshield-agent)
#

set -euo pipefail

# ── colors ─────────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  BOLD=$'\033[1m'; CYAN=$'\033[36m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'
  RED=$'\033[31m'; DIM=$'\033[2m'; RESET=$'\033[0m'
else
  BOLD=""; CYAN=""; GREEN=""; YELLOW=""; RED=""; DIM=""; RESET=""
fi

step() { echo "${CYAN}${BOLD}▸${RESET} ${BOLD}$*${RESET}"; }
ok()   { echo "${GREEN}✓${RESET} $*"; }
warn() { echo "${YELLOW}⚠${RESET} $*"; }
err()  { echo "${RED}✗${RESET} $*"; exit 1; }
info() { echo "${DIM}  $*${RESET}"; }

# ── banner ─────────────────────────────────────────────────────────────────
cat <<EOF

${BOLD}${CYAN}╭─────────────────────────────────────╮
│   KeyShield agent installer         │
│   Self-custodian API key vault      │
╰─────────────────────────────────────╯${RESET}

EOF

# ── prerequisites ──────────────────────────────────────────────────────────
step "Checking prerequisites"
command -v python3 >/dev/null 2>&1 || err "python3 is required (https://python.org)"
PYV=$(python3 -c 'import sys; print(f"{sys.version_info[0]}.{sys.version_info[1]}")')
ok "python3 ${PYV}"
command -v curl    >/dev/null 2>&1 || err "curl is required"
ok "curl"

# ── config ─────────────────────────────────────────────────────────────────
KS_BASE="${KS_BASE:-http://localhost:8000}"
KS_INSTALL_DIR="${KS_INSTALL_DIR:-./keyshield-agent}"
KS_AGENT_NAME="${KS_AGENT_NAME:-$(hostname -s 2>/dev/null || echo agent)-agent}"

step "Configuration"
info "Server:        ${KS_BASE}"
info "Install dir:   ${KS_INSTALL_DIR}"
info "Agent name:    ${KS_AGENT_NAME}"

# ── ping the server ────────────────────────────────────────────────────────
step "Testing connection to KeyShield server"
if curl -fsS --max-time 5 "${KS_BASE}/health" >/dev/null 2>&1; then
  ok "Server reachable at ${KS_BASE}"
else
  warn "Server not reachable at ${KS_BASE}"
  info "Make sure the backend is running, or set KS_BASE to a reachable URL."
  info "Continuing with offline setup — you can fix the URL in .env later."
fi

# ── prompt for required inputs ─────────────────────────────────────────────
if [[ -z "${KS_OWNER_WALLET:-}" ]]; then
  echo
  echo "${BOLD}Owner wallet${RESET} — your Solana wallet address (the vault owner)"
  read -rp "  KS_OWNER_WALLET: " KS_OWNER_WALLET
  [[ -z "$KS_OWNER_WALLET" ]] && err "owner wallet is required"
fi

if [[ -z "${KS_VAULT_PASS:-}" ]]; then
  echo
  echo "${BOLD}Vault passphrase${RESET} — used to decrypt your stored API keys"
  read -rsp "  KS_VAULT_PASS: " KS_VAULT_PASS
  echo
  [[ -z "$KS_VAULT_PASS" ]] && err "vault passphrase is required"
fi

# ── create install dir ─────────────────────────────────────────────────────
step "Creating install directory"
mkdir -p "${KS_INSTALL_DIR}"
cd "${KS_INSTALL_DIR}"
ok "${PWD}"

# ── venv ───────────────────────────────────────────────────────────────────
step "Creating Python virtual environment"
if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate
ok ".venv created and activated"

# ── deps ───────────────────────────────────────────────────────────────────
step "Installing dependencies"
pip install --quiet --upgrade pip
pip install --quiet httpx pynacl
ok "httpx, pynacl installed"

# ── pull SDK ──────────────────────────────────────────────────────────────
step "Downloading KeyShield SDK"
SDK_URL="${KS_BASE}/static/keyshield_sdk.py"
if curl -fsS --max-time 5 "${SDK_URL}" -o keyshield_sdk.py 2>/dev/null; then
  ok "SDK downloaded from ${SDK_URL}"
else
  # Fallback: copy from sibling directory if installer is run locally
  if [[ -f "$(dirname "$0")/keyshield_sdk.py" ]]; then
    cp "$(dirname "$0")/keyshield_sdk.py" .
    ok "SDK copied from local source"
  else
    err "Could not fetch SDK from ${SDK_URL} or local fallback"
  fi
fi

# ── generate keypair ───────────────────────────────────────────────────────
step "Generating ed25519 keypair for this agent"
KEYPAIR_JSON=$(python3 -c '
import json
from keyshield_sdk import AgentKeyShield
print(json.dumps(AgentKeyShield.generate_keypair()))
')
PRIVKEY=$(python3 -c "import json; print(json.loads('''${KEYPAIR_JSON}''')['private_key_hex'])")
PUBKEY=$(python3 -c "import json; print(json.loads('''${KEYPAIR_JSON}''')['pubkey_b58'])")

ok "Keypair generated"
info "  Public key:  ${PUBKEY:0:24}…${PUBKEY: -8}"
info "  Private key: ${PRIVKEY:0:8}…${PRIVKEY: -8} (saved to .env)"

# ── write .env ─────────────────────────────────────────────────────────────
step "Writing .env file"
cat > .env <<EOF
# KeyShield agent credentials
# ─────────────────────────────────────────────────────────────────────────────
# Generated by install.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ)
# DO NOT commit this file. Add to .gitignore.

KS_BASE=${KS_BASE}
KS_OWNER_WALLET=${KS_OWNER_WALLET}
KS_VAULT_PASS=${KS_VAULT_PASS}
KS_AGENT_KEY=${PRIVKEY}
KS_AGENT_PUBKEY=${PUBKEY}
KS_AGENT_NAME=${KS_AGENT_NAME}
EOF
chmod 600 .env

# .gitignore
echo ".env" >> .gitignore
echo ".venv/" >> .gitignore
sort -u .gitignore -o .gitignore
ok ".env created (chmod 600), .gitignore updated"

# ── starter script ─────────────────────────────────────────────────────────
step "Writing starter script (agent_demo.py)"
cat > agent_demo.py <<'PYEOF'
"""
agent_demo.py — minimal KeyShield agent

Run:
  source .venv/bin/activate
  source .env  # or use python-dotenv
  python agent_demo.py
"""
import os
from dotenv import load_dotenv
load_dotenv()  # pulls from .env

from keyshield_sdk import AgentKeyShield

agent = AgentKeyShield(
    owner_wallet     = os.environ["KS_OWNER_WALLET"],
    private_key_hex  = os.environ["KS_AGENT_KEY"],
    vault_passphrase = os.environ["KS_VAULT_PASS"],
    base_url         = os.environ.get("KS_BASE", "http://localhost:8000"),
)

# 1. Authenticate (automatic on first call)
agent.authenticate()
print(f"agent authenticated as {agent.pubkey_b58[:16]}…")

# 2. List vault keys you have access to
print("vault keys:", agent.list_keys())

# 3. Make a proxied call (uncomment once you've stored a key)
# resp = agent.proxy("openai", "v1/chat/completions", json={
#     "model": "gpt-4o-mini",
#     "messages": [{"role": "user", "content": "hello"}],
# })
# print(resp.json()["choices"][0]["message"]["content"])
PYEOF
pip install --quiet python-dotenv
ok "agent_demo.py created"

# ── done ───────────────────────────────────────────────────────────────────
cat <<EOF

${GREEN}${BOLD}✓ Installation complete${RESET}

${BOLD}Next steps:${RESET}

  ${CYAN}1.${RESET} Register this agent's public key in the dashboard:
     ${CYAN}${KS_BASE/8000/3001}${RESET}  →  Agents tab  →  paste:

     ${BOLD}${PUBKEY}${RESET}

  ${CYAN}2.${RESET} Run the demo:
     ${DIM}cd ${KS_INSTALL_DIR}${RESET}
     ${DIM}source .venv/bin/activate${RESET}
     ${DIM}python agent_demo.py${RESET}

  ${CYAN}3.${RESET} Use the agent in your code:
     ${DIM}from keyshield_sdk import AgentKeyShield${RESET}
     ${DIM}agent = AgentKeyShield()  # picks up env vars automatically${RESET}
     ${DIM}client = agent.openai_client()${RESET}

${DIM}Environment variables saved to:  ${KS_INSTALL_DIR}/.env
SDK saved to:                    ${KS_INSTALL_DIR}/keyshield_sdk.py
Demo script:                     ${KS_INSTALL_DIR}/agent_demo.py${RESET}

EOF
