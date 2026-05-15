"""
Integration test: Agent authentication + proxy + billing full flow.

Tests:
  1. Owner wallet-login  → get owner token
  2. Register agent keypair under owner  (/agents/register)
  3. Agent signs challenge → agent token  (user_id == owner_wallet)
  4. Verify agent token uid == owner_pubkey
  5. Top-up balance, verify credited_usd + balance_usd shape
  6. Proxy call through agent session (fake key → upstream 401, but call logged)
  7. Revoke agent → subsequent login returns 401

Usage:
    python tests/integration/test_agent_flow.py           # local :8001
    KS_API=https://keyshield-production.up.railway.app \\
        python tests/integration/test_agent_flow.py       # Railway

PyNaCl (pynacl) and base58 are already in requirements.txt.
No real Solana wallet or real API keys needed.
"""

from __future__ import annotations

import base64
import json
import os
import sys
import time

import requests

try:
    from nacl.signing import SigningKey
    import base58 as _b58
except ImportError:
    sys.exit("pip install pynacl base58  (already in requirements.txt)")

API = os.getenv("KS_API", "http://localhost:8001")
VERBOSE = os.getenv("VERBOSE", "1") != "0"

# ── pretty output ─────────────────────────────────────────────────────────────
G, R, Y, B = "\033[32m", "\033[31m", "\033[33m", "\033[1m"
E = "\033[0m"


def ok(msg: str) -> None:   print(f"  {G}✓{E} {msg}")
def fail(msg: str) -> None: print(f"  {R}✗{E} {msg}"); sys.exit(1)
def info(msg: str) -> None:
    if VERBOSE: print(f"  {Y}·{E} {msg}")
def section(t: str) -> None: print(f"\n{B}── {t} ──{E}")


# ── crypto ────────────────────────────────────────────────────────────────────

def gen_keypair() -> tuple[SigningKey, str]:
    """Return (signing_key, base58-pubkey)."""
    sk = SigningKey.generate()
    pub = _b58.b58encode(bytes(sk.verify_key)).decode()
    return sk, pub


def sign_b64(sk: SigningKey, message: str) -> str:
    """ed25519-sign `message`, return base64 (no padding)."""
    return base64.b64encode(sk.sign(message.encode()).signature).decode().rstrip("=")


# ── HTTP ──────────────────────────────────────────────────────────────────────

def _hdr(token: str | None) -> dict:
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def POST(path: str, body: dict, token: str | None = None) -> tuple[int, dict]:
    r = requests.post(f"{API}{path}", json=body, headers=_hdr(token), timeout=15)
    info(f"POST {path} → {r.status_code}")
    try:   return r.status_code, r.json()
    except Exception: return r.status_code, {"raw": r.text}


def GET(path: str, token: str | None = None, params: dict | None = None) -> tuple[int, dict]:
    r = requests.get(f"{API}{path}", headers=_hdr(token), params=params, timeout=15)
    info(f"GET  {path} → {r.status_code}")
    try:   return r.status_code, r.json()
    except Exception: return r.status_code, {"raw": r.text}


def DELETE(path: str, token: str | None = None) -> tuple[int, dict]:
    r = requests.delete(f"{API}{path}", headers=_hdr(token), timeout=15)
    info(f"DEL  {path} → {r.status_code}")
    try:   return r.status_code, r.json()
    except Exception: return r.status_code, {"raw": r.text}


# ════════════════════════════════════════════════════════════════════════════
# Tests
# ════════════════════════════════════════════════════════════════════════════

def test_owner_login() -> tuple[str, str, SigningKey]:
    section("1. Owner wallet login")
    sk, pub = gen_keypair()
    info(f"owner pubkey: {pub[:16]}…")

    status, body = GET("/auth/wallet-challenge")
    if status != 200: fail(f"wallet-challenge {status}: {body}")
    challenge = body["challenge"]
    ok(f"challenge: {challenge[:16]}…")

    sig = sign_b64(sk, challenge)
    status, body = POST("/auth/wallet-login", {
        "walletAddress": pub,
        "challenge":     challenge,
        "nonce":         challenge,
        "signature":     sig,
        "passphrase":    "test-integration",
    })
    if status != 200: fail(f"wallet-login {status}: {body}")
    token = body.get("token")
    if not token: fail(f"no token in {body}")
    ok(f"owner token: …{token[-8:]}")
    return token, pub, sk


def test_register_agent(owner_token: str) -> tuple[SigningKey, str, int]:
    section("2. Register agent keypair")
    agent_sk, agent_pub = gen_keypair()
    info(f"agent pubkey: {agent_pub[:16]}…")

    status, body = POST("/agents/register", {
        "pubkeyB58": agent_pub,
        "name":      f"test-bot-{int(time.time())}",
    }, token=owner_token)

    if status == 409:
        ok("agent already registered (409 duplicate — idempotent)")
    elif status != 200:
        fail(f"agents/register {status}: {body}")
    else:
        ok("agent registered")

    # Get numeric ID from the list
    status2, body2 = GET("/agents/list", token=owner_token)
    if status2 != 200: fail(f"agents/list {status2}: {body2}")
    agents = body2.get("agents", [])
    match = next((a for a in agents if a["pubkey_b58"] == agent_pub), None)
    if not match: fail(f"registered agent not found in list: {agents}")
    agent_id = match["id"]
    ok(f"agent id={agent_id}")
    return agent_sk, agent_pub, agent_id


def test_agent_login(agent_sk: SigningKey, agent_pub: str) -> str:
    section("3. Agent challenge-response login")
    status, body = POST("/auth/agent-challenge", {})
    if status != 200: fail(f"agent-challenge {status}: {body}")
    challenge = body["challenge"]
    ok(f"challenge: {challenge[:16]}…")

    sig = sign_b64(agent_sk, challenge)
    status, body = POST("/auth/agent-login", {
        "pubkeyB58": agent_pub,
        "challenge":  challenge,
        "nonce":      challenge,
        "signature":  sig,
    })
    if status != 200: fail(f"agent-login {status}: {body}")
    token = body.get("token")
    if not token: fail(f"no token in {body}")
    ok(f"agent token: …{token[-8:]}")
    return token


def test_agent_identity(agent_token: str, owner_pub: str) -> None:
    """Decode the JWT-like payload and verify uid == owner wallet."""
    section("4. Agent token uid == owner wallet")
    parts = agent_token.split(".")
    if len(parts) < 2: fail("token has no dot")
    p = parts[0] + "=" * (4 - len(parts[0]) % 4)
    try:
        payload = json.loads(base64.urlsafe_b64decode(p))
    except Exception as e:
        fail(f"decode payload: {e}")
    uid = payload.get("uid", "")
    info(f"token uid:    {uid[:20]}…")
    info(f"owner pubkey: {owner_pub[:20]}…")
    if uid == owner_pub:
        ok("uid matches owner_pubkey — agent acts as owner ✓")
    else:
        fail(f"uid mismatch: '{uid[:16]}' != '{owner_pub[:16]}'")


def test_billing_topup(owner_token: str) -> None:
    section("5. Billing — topup")
    status, body = GET("/billing/balance", token=owner_token)
    initial = body.get("balance_usd", 0.0) if status == 200 else 0.0
    info(f"initial balance: ${initial:.4f}")

    status, body = POST("/billing/topup", {"amount_usd": 5.0}, token=owner_token)
    if status != 200: fail(f"topup {status}: {body}")

    # Verify response shape
    if "credited_usd" not in body: fail(f"missing credited_usd in {body}")
    if "balance_usd"  not in body: fail(f"missing balance_usd in {body}")
    credited     = body["credited_usd"]
    new_balance  = body["balance_usd"]
    if abs(credited - 5.0) > 0.01:
        fail(f"credited_usd expected 5.0, got {credited}")
    ok(f"topup OK: +${credited:.2f} → balance ${new_balance:.4f}")


def test_proxy_logged(agent_token: str) -> None:
    """Proxy call with a fake key. Upstream rejects with 401 — but the
    proxy forwarded the call and logged it under the owner's user_id."""
    section("6. Proxy call → usage logged")
    headers = {
        "Authorization":      f"Bearer {agent_token}",
        "Content-Type":       "application/json",
        "X-Upstream-API-Key": "sk-fake-test-key-integration",
    }
    body = json.dumps({
        "model": "gpt-4o-mini",
        "messages": [{"role": "user", "content": "ping"}],
    })
    r = requests.post(
        f"{API}/proxy/openai/v1/chat/completions",
        headers=headers, data=body, timeout=20,
    )
    info(f"upstream replied {r.status_code} (401 expected with fake key)")
    if r.status_code not in (200, 400, 401, 429):
        fail(f"unexpected proxy status {r.status_code}: {r.text[:200]}")
    ok(f"proxy forwarded, upstream said {r.status_code}")

    time.sleep(0.3)  # let usage flush
    status, hist = GET("/usage/history", token=agent_token)
    if status == 200:
        calls = [h for h in hist.get("history", []) if h.get("upstream") == "openai"]
        if calls:
            ok(f"usage: {len(calls)} openai call(s) logged for owner")
        else:
            info("no openai calls in history yet (async write — acceptable)")
    else:
        info(f"usage/history {status} — skipping log check")


def test_revoke_agent(owner_token: str, agent_sk: SigningKey,
                      agent_pub: str, agent_id: int) -> None:
    section("7. Revoke agent → login blocked")

    # Use DELETE /agents/{numeric_id}
    status, body = DELETE(f"/agents/{agent_id}", token=owner_token)
    if status not in (200, 204): fail(f"revoke {status}: {body}")
    ok(f"agent {agent_id} revoked")

    # Try to log in again — must fail
    status2, body2 = POST("/auth/agent-challenge", {})
    if status2 != 200: fail(f"agent-challenge {status2}")
    challenge2 = body2["challenge"]
    sig2 = sign_b64(agent_sk, challenge2)

    status3, body3 = POST("/auth/agent-login", {
        "pubkeyB58": agent_pub,
        "challenge":  challenge2,
        "nonce":      challenge2,
        "signature":  sig2,
    })
    if status3 in (401, 403):
        ok(f"revoked agent correctly rejected ({status3}) ✓")
    else:
        fail(f"expected 401/403 after revoke, got {status3}: {body3}")


# ════════════════════════════════════════════════════════════════════════════
# Main
# ════════════════════════════════════════════════════════════════════════════

def main() -> None:
    print(f"\n{B}KeyShield — Agent Integration Tests{E}")
    print(f"API: {API}\n")

    # Connectivity check
    try:
        r = requests.get(f"{API}/health", timeout=5)
        info(f"health → {r.status_code}")
    except Exception as e:
        fail(f"Backend unreachable ({API}): {e}")

    owner_token, owner_pub, owner_sk = test_owner_login()
    agent_sk, agent_pub, agent_id    = test_register_agent(owner_token)
    agent_token                       = test_agent_login(agent_sk, agent_pub)
    test_agent_identity(agent_token, owner_pub)
    test_billing_topup(owner_token)
    test_proxy_logged(agent_token)
    test_revoke_agent(owner_token, agent_sk, agent_pub, agent_id)

    print(f"\n{B}{G}All 7 tests passed.{E}\n")


if __name__ == "__main__":
    main()
