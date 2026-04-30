"""
Oracle-diff harness for Stage-1 acceptance.

Spins up:
  1. A mock upstream HTTP server on a random port. 5-7 canned routes
     (Helius RPC, OpenAI, Anthropic) that return deterministic JSON so
     the only delta between Python's response and Rust's is whatever
     the proxy itself adds/strips.
  2. The Python oracle (`v2-mvp/src/server.py`) on :8001 with
     `KS_UPSTREAM_OVERRIDE_BASE` pointed at the mock.
  3. The Rust port (`ks-proxy` release binary) on :8000 with the same
     override env var. PYTHON_BACKEND_URL points back at :8001 so the
     Rust fall-through still exits cleanly.

Then sends a fixed list of fixtures to *both* :8000 and :8001 with the
dev-bypass session shortcut, captures (status, body) on each side, and
diffs them. Per-fixture the comparison is either `byte` (canonical
JSON cache HIT or MISS through pycompat) or `structural` (uncached AI
calls, /health, /manage/batch — JSON-equal modulo timestamps). Exits 0
iff every fixture is green.

This file deliberately avoids non-stdlib dependencies (no aiohttp /
requests / pytest) — the only external Python is the v2-mvp venv that
runs the oracle subprocess, which we activate via the wrapper script.

See `proxy-rs/BOUNDARY.md` "Oracle for the port" and
`proxy-rs/ADR-001-divergences.md` for the spec.
"""

from __future__ import annotations

import argparse
import contextlib
import http.client
import json
import os
import shutil
import signal
import socket
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
PROXY_RS = REPO_ROOT / "proxy-rs"
V2_MVP = REPO_ROOT / "v2-mvp"

DEV_BYPASS_TOKEN = "dev-bypass"

# ───────────────────────── mock upstream ──────────────────────────────────────


class MockUpstream(BaseHTTPRequestHandler):
    """Canned JSON for the upstreams we exercise."""

    # Counter shared across all instances so fixtures can assert "no
    # second mock-server hit" on cache HIT scenarios.
    request_log: list[dict] = []
    log_lock = threading.Lock()

    def log_message(self, *args, **kwargs):
        # Silence default access-log spam; we have our own counter.
        return

    # --- helpers ------------------------------------------------------

    def _read_body(self) -> bytes:
        n = int(self.headers.get("content-length") or 0)
        return self.rfile.read(n) if n > 0 else b""

    def _send_json(self, status: int, body: dict | list) -> None:
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _record(self, method: str, path: str, body: bytes) -> None:
        with self.log_lock:
            self.request_log.append({"method": method, "path": path, "body": body})

    # --- routes -------------------------------------------------------

    def do_POST(self) -> None:  # noqa: N802 (BaseHTTPRequestHandler API)
        body = self._read_body()
        self._record("POST", self.path, body)
        # Path may include `?api-key=...`; split it off.
        url = urllib.parse.urlparse(self.path)
        bare = url.path

        # ── Helius RPC: any POST whose body is JSON-RPC dict ──────────
        if bare in ("/", "/das", "/v0/transactions") or bare.endswith("/"):
            try:
                rpc = json.loads(body or b"{}")
            except Exception:
                rpc = None
            if isinstance(rpc, dict) and "method" in rpc:
                method = rpc["method"]
                rpc_id = rpc.get("id", 1)
                params = rpc.get("params", [])
                result = canned_helius(method, params)
                self._send_json(200, {"jsonrpc": "2.0", "id": rpc_id, "result": result})
                return

        # ── OpenAI chat ───────────────────────────────────────────────
        if bare == "/v1/chat/completions":
            self._send_json(200, {
                "id": "chatcmpl-test",
                "object": "chat.completion",
                "model": "gpt-4o-mini",
                "choices": [
                    {
                        "index": 0,
                        "message": {"role": "assistant", "content": "ok"},
                        "finish_reason": "stop",
                    }
                ],
                "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
            })
            return

        # ── Anthropic messages ───────────────────────────────────────
        if bare == "/v1/messages":
            self._send_json(200, {
                "id": "msg_test",
                "type": "message",
                "role": "assistant",
                "model": "claude-3-haiku-20240307",
                "content": [{"type": "text", "text": "ok"}],
                "stop_reason": "end_turn",
                "usage": {"input_tokens": 1, "output_tokens": 1},
            })
            return

        # Unknown POST → 404 JSON
        self._send_json(404, {"error": "unknown route"})

    def do_GET(self) -> None:  # noqa: N802
        self._record("GET", self.path, b"")
        url = urllib.parse.urlparse(self.path)
        bare = url.path

        if bare == "/v1/models":
            self._send_json(200, {
                "object": "list",
                "data": [
                    {"id": "gpt-4o-mini", "object": "model", "owned_by": "openai"},
                    {"id": "gpt-3.5-turbo", "object": "model", "owned_by": "openai"},
                ],
            })
            return

        if bare == "/v1/anthropic-models":
            self._send_json(200, {
                "data": [{"id": "claude-3-haiku-20240307", "type": "model"}],
            })
            return

        # Default: echo the path (used as catch-all, treated as 404
        # by the proxy layer when it parses the body).
        self._send_json(404, {"error": "unknown route", "path": self.path})


def canned_helius(method: str, params) -> object:
    """Deterministic results so cache HIT == cache MISS bytewise."""
    if method == "getBalance":
        return {"context": {"slot": 100}, "value": 5_000_000_000}
    if method == "getAsset":
        return {
            "interface": "V1_NFT",
            "id": (params[0] if params else "asset-id"),
            "content": {"json_uri": "https://example.com/nft.json"},
        }
    if method == "getAssetsByOwner":
        return {"items": [{"id": "asset-1"}, {"id": "asset-2"}], "total": 2}
    if method == "sendTransaction":
        return "tx-signature-deadbeef"
    if method == "getTokenAccountBalance":
        return {"context": {"slot": 100}, "value": {"amount": "12345", "decimals": 6}}
    if method == "getTransaction":
        return {"slot": 100, "transaction": {"signatures": ["sig"]}}
    return {"echo": method, "params": params}


def start_mock_server() -> tuple[ThreadingHTTPServer, int]:
    server = ThreadingHTTPServer(("127.0.0.1", 0), MockUpstream)
    port = server.server_address[1]
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    return server, port


# ───────────────────────── server orchestration ───────────────────────────────


def _wait_listen(host: str, port: int, timeout: float = 30.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        with contextlib.suppress(OSError):
            with socket.create_connection((host, port), timeout=0.5):
                return
        time.sleep(0.1)
    raise TimeoutError(f"port {port} never came up")


def _wait_health(url: str, timeout: float = 30.0) -> None:
    deadline = time.monotonic() + timeout
    last_err: Exception | None = None
    while time.monotonic() < deadline:
        try:
            r = urllib.request.urlopen(url, timeout=1.0)
            if r.status == 200:
                return
        except Exception as e:  # noqa: BLE001
            last_err = e
        time.sleep(0.1)
    raise TimeoutError(f"{url} health-check never returned 200: {last_err}")


def make_empty_session_db(path: Path) -> None:
    """Create the empty schema Rust expects to open read-only."""
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path))
    try:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS sessions ("
            "token TEXT PRIMARY KEY, "
            "user_id TEXT NOT NULL, "
            "enc_pass BLOB NOT NULL, "
            "expires_at INTEGER NOT NULL"
            ")"
        )
        conn.commit()
    finally:
        conn.close()


def _resolve_python() -> str:
    """Pick a Python that has fastapi + uvicorn installed.

    Order:
      1. `KS_PYTHON` env override.
      2. v2-mvp/.venv/bin/python (works in all the keyshield worktrees).
      3. ../v2-mvp/.venv/bin/python (sibling worktree convention).
      4. system `python3` (will fail if uvicorn missing — caller sees
         the error in the log file).
    """
    override = os.environ.get("KS_PYTHON")
    if override:
        return override
    candidates = [
        V2_MVP / ".venv" / "bin" / "python",
        # When running from a Conductor worktree, the canonical venv
        # may live in the *original* checkout instead of the worktree.
        # The repo path layout puts the worktree at `.claude/worktrees/<x>/`,
        # so two levels up from V2_MVP is the worktree root, four is the
        # original repo. Probe the obvious places.
        REPO_ROOT.parent.parent.parent / "v2-mvp" / ".venv" / "bin" / "python",
        Path("/Users/aileen/Downloads/privacy_hack/keyshield/v2-mvp/.venv/bin/python"),
    ]
    for c in candidates:
        if c.is_file() and os.access(c, os.X_OK):
            return str(c)
    return shutil.which("python3") or sys.executable


def spawn_python(env: dict[str, str], log_file: Path) -> subprocess.Popen:
    py = _resolve_python()
    print(f"[harness] uvicorn python: {py}", file=sys.stderr)
    cmd = [py, "-m", "uvicorn", "src.server:app", "--host", "127.0.0.1",
           "--port", "8001", "--log-level", "warning"]
    return subprocess.Popen(
        cmd, cwd=str(V2_MVP), env=env,
        stdout=open(log_file, "wb"), stderr=subprocess.STDOUT,
    )


def spawn_rust(env: dict[str, str], log_file: Path) -> subprocess.Popen:
    bin_path = PROXY_RS / "target" / "release" / "ks-proxy"
    if not bin_path.exists():
        raise RuntimeError(
            f"Rust binary not built at {bin_path}. "
            f"Run `cargo build -p ks-proxy --release` first."
        )
    cmd = [str(bin_path)]
    return subprocess.Popen(
        cmd, env=env,
        stdout=open(log_file, "wb"), stderr=subprocess.STDOUT,
    )


# ───────────────────────── HTTP client ────────────────────────────────────────


def call(base_url: str, fixture: dict) -> dict:
    """Single proxy request. Returns {status, headers, body_bytes}."""
    method = fixture["request"]["method"]
    path = fixture["request"]["path"]
    raw = fixture["request"].get("body")
    if raw is None:
        body = b""
    elif isinstance(raw, (bytes, bytearray)):
        body = bytes(raw)
    else:
        body = json.dumps(raw).encode()

    parsed = urllib.parse.urlparse(base_url)
    conn = http.client.HTTPConnection(parsed.hostname, parsed.port, timeout=15)
    headers = {
        "Authorization": f"Bearer {DEV_BYPASS_TOKEN}",
        "Content-Type": "application/json",
    }
    conn.request(method, path, body=body, headers=headers)
    resp = conn.getresponse()
    body_bytes = resp.read()
    out = {
        "status": resp.status,
        "headers": {k.lower(): v for k, v in resp.getheaders()},
        "body": body_bytes,
    }
    conn.close()
    return out


# ───────────────────────── diff modes ─────────────────────────────────────────


def _strip_volatile(data, drop_keys: set[str]):
    """Recursively drop the named keys from any dict we encounter."""
    if isinstance(data, dict):
        return {
            k: _strip_volatile(v, drop_keys)
            for k, v in data.items()
            if k not in drop_keys
        }
    if isinstance(data, list):
        return [_strip_volatile(x, drop_keys) for x in data]
    return data


# Keys we tolerate diverging on for "structural" comparisons. Both servers
# attach their own per-call timestamps, latency hints, and id-y strings to
# the body or pull them from upstream — none of that affects routing
# correctness, which is what we're verifying.
STRUCTURAL_DROP_KEYS = {
    "created", "createdAt", "updated_at", "id",
    "request_id", "x-request-id", "trace_id",
    "generic_cache", "cache_entries", "router", "version",
}


def compare(name: str, mode: str, py: dict, rs: dict, drop_keys: set[str] | None = None) -> tuple[bool, str]:
    """Returns (ok, detail)."""
    if py["status"] != rs["status"]:
        return False, f"status: py={py['status']} rs={rs['status']}"

    if mode == "byte":
        if py["body"] == rs["body"]:
            return True, f"byte-equal ({len(py['body'])} bytes)"
        return False, (
            f"byte mismatch ({len(py['body'])} vs {len(rs['body'])} bytes)\n"
            f"  py[:120] = {py['body'][:120]!r}\n"
            f"  rs[:120] = {rs['body'][:120]!r}"
        )

    if mode == "structural":
        try:
            pyj = json.loads(py["body"]) if py["body"] else None
            rsj = json.loads(rs["body"]) if rs["body"] else None
        except Exception as e:
            return False, f"structural mode but body not JSON: {e}"
        keys = (drop_keys or set()) | STRUCTURAL_DROP_KEYS
        pyj2 = _strip_volatile(pyj, keys)
        rsj2 = _strip_volatile(rsj, keys)
        if pyj2 == rsj2:
            return True, "structural-equal"
        return False, f"structural mismatch:\n  py={json.dumps(pyj2, sort_keys=True)[:200]}\n  rs={json.dumps(rsj2, sort_keys=True)[:200]}"

    if mode == "status_only":
        # Both servers must return the same HTTP status; bodies may
        # differ in shape (e.g. FastAPI's `{"detail": "..."}` vs Rust's
        # plain-text `"unknown upstream"`). Status equality is what
        # callers actually depend on.
        return True, f"status-only-equal ({py['status']})"

    return False, f"unknown compare mode: {mode}"


# ───────────────────────── fixtures ───────────────────────────────────────────


FIXTURES: list[dict] = [
    {
        "name": "helius_getBalance_miss",
        "request": {
            "method": "POST",
            "path": "/proxy/helius/",
            "body": {"jsonrpc": "2.0", "id": 1, "method": "getBalance",
                     "params": ["7g3xR9rH3sB2jKP9wMzGfTHuQwFVJSN1F8nVm5n6FFiE"]},
        },
        "compare": "byte",
        "expect_cache": "MISS",
    },
    {
        "name": "helius_getBalance_hit",
        "request": {
            "method": "POST",
            "path": "/proxy/helius/",
            "body": {"jsonrpc": "2.0", "id": 1, "method": "getBalance",
                     "params": ["7g3xR9rH3sB2jKP9wMzGfTHuQwFVJSN1F8nVm5n6FFiE"]},
        },
        "compare": "byte",
        "expect_cache": "HIT",
    },
    {
        "name": "helius_getAsset_miss",
        "request": {
            "method": "POST",
            "path": "/proxy/helius/",
            "body": {"jsonrpc": "2.0", "id": 7, "method": "getAsset",
                     "params": ["NFT-MINT-ADDR"]},
        },
        "compare": "byte",
        "expect_cache": "MISS",
    },
    {
        "name": "helius_getAsset_hit",
        "request": {
            "method": "POST",
            "path": "/proxy/helius/",
            "body": {"jsonrpc": "2.0", "id": 7, "method": "getAsset",
                     "params": ["NFT-MINT-ADDR"]},
        },
        "compare": "byte",
        "expect_cache": "HIT",
    },
    {
        "name": "helius_sendTx_no_cache",
        "request": {
            "method": "POST",
            "path": "/proxy/helius/",
            "body": {"jsonrpc": "2.0", "id": 9, "method": "sendTransaction",
                     "params": ["base64-tx-bytes"]},
        },
        "compare": "byte",
        "expect_cache": "MISS",
    },
    {
        "name": "openai_chat_uncached",
        "request": {
            "method": "POST",
            "path": "/proxy/openai/v1/chat/completions",
            "body": {"model": "gpt-4o-mini",
                     "messages": [{"role": "user", "content": "hi"}]},
        },
        "compare": "structural",
        "expect_cache": "MISS",
    },
    {
        "name": "openai_models_miss",
        "request": {"method": "GET", "path": "/proxy/openai/v1/models"},
        "compare": "byte",
        "expect_cache": "MISS",
    },
    {
        "name": "openai_models_hit",
        "request": {"method": "GET", "path": "/proxy/openai/v1/models"},
        "compare": "byte",
        "expect_cache": "HIT",
    },
    {
        "name": "anthropic_messages_uncached",
        "request": {
            "method": "POST",
            "path": "/proxy/anthropic/v1/messages",
            "body": {"model": "claude-3-haiku-20240307",
                     "max_tokens": 16,
                     "messages": [{"role": "user", "content": "hi"}]},
        },
        "compare": "structural",
        "expect_cache": "MISS",
    },
    {
        "name": "manage_batch_three_items",
        "request": {
            "method": "POST",
            "path": "/manage/batch",
            "body": {"requests": [
                {"upstream": "helius",
                 "body": {"jsonrpc": "2.0", "id": 1, "method": "getBalance",
                          "params": ["A"]}},
                {"upstream": "helius",
                 "body": {"jsonrpc": "2.0", "id": 2, "method": "getAssetsByOwner",
                          "params": ["B"]}},
                {"upstream": "nope-not-real",
                 "body": {}},
            ]},
        },
        "compare": "structural",
        "expect_cache": None,
    },
    {
        "name": "health",
        "request": {"method": "GET", "path": "/health"},
        "compare": "structural",
        "expect_cache": None,
    },
    {
        "name": "unknown_upstream_404",
        "request": {"method": "POST", "path": "/proxy/foo/bar",
                    "body": {"any": "thing"}},
        # Status-only: Python returns FastAPI's `{"detail": "unknown
        # upstream"}` envelope; Rust returns the literal "unknown
        # upstream" string per ADR-001 #10. Both 404. Bodies diverge
        # by design (Python ergonomics vs Rust verbatim), so we assert
        # status equality only.
        "compare": "status_only",
        "expect_cache": None,
    },
]


# ───────────────────────── runner ─────────────────────────────────────────────


def run_one(name: str, fixture: dict, py_resp: dict, rs_resp: dict, dump_dir: Path) -> tuple[bool, str]:
    expect_cache = fixture.get("expect_cache")
    cache_ok = True
    cache_detail = ""
    if expect_cache is not None:
        py_cache = py_resp["headers"].get("x-ks-cache")
        rs_cache = rs_resp["headers"].get("x-ks-cache")
        if py_cache != expect_cache or rs_cache != expect_cache:
            cache_ok = False
            cache_detail = (
                f"cache header mismatch (expected {expect_cache}): "
                f"py={py_cache!r} rs={rs_cache!r}"
            )

    ok, detail = compare(name, fixture["compare"], py_resp, rs_resp)
    if not ok:
        # Dump bodies so a developer can hex-diff.
        dump_dir.mkdir(parents=True, exist_ok=True)
        (dump_dir / f"{name}_python.bin").write_bytes(py_resp["body"])
        (dump_dir / f"{name}_rust.bin").write_bytes(rs_resp["body"])

    if not cache_ok:
        return False, cache_detail + ("\n  " + detail if not ok else "")
    return ok, detail


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--keep-tmp", action="store_true",
                        help="Keep the temp dir around for inspection.")
    parser.add_argument("--dump", default="/tmp",
                        help="Where to dump byte-mismatched bodies.")
    args = parser.parse_args()

    tmp = Path(tempfile.mkdtemp(prefix="oracle_diff_"))
    print(f"[harness] tmp dir: {tmp}", file=sys.stderr)

    vault_dir = tmp / "vault"
    sessions_db = tmp / "sessions.db"
    py_log = tmp / "python.log"
    rs_log = tmp / "rust.log"
    make_empty_session_db(sessions_db)

    # --- mock upstream ----------------------------------------------------
    server, mock_port = start_mock_server()
    print(f"[harness] mock upstream on :{mock_port}", file=sys.stderr)

    procs: list[subprocess.Popen] = []

    def cleanup() -> None:
        for p in procs:
            with contextlib.suppress(ProcessLookupError):
                p.send_signal(signal.SIGTERM)
        for p in procs:
            with contextlib.suppress(Exception):
                p.wait(timeout=5)
            with contextlib.suppress(ProcessLookupError):
                p.kill()
        with contextlib.suppress(Exception):
            server.shutdown()
        if not args.keep_tmp:
            shutil.rmtree(tmp, ignore_errors=True)

    try:
        # --- python oracle on :8001 -------------------------------------
        py_env = os.environ.copy()
        py_env.update({
            "KS_UPSTREAM_OVERRIDE_BASE": f"http://127.0.0.1:{mock_port}",
            "KS_VAULT_DIR": str(vault_dir),
            "OPENAI_API_KEY": "test-platform",
            "HELIUS_API_KEY": "test-platform",
            "ANTHROPIC_API_KEY": "test-platform",
            "MISTRAL_API_KEY": "test-platform",
            "COHERE_API_KEY": "test-platform",
            "GROQ_API_KEY": "test-platform",
            "ZEROX_API_KEY": "test-platform",
            "TITAN_API_KEY": "test-platform",
            "PYTH_API_KEY": "test-platform",
            "ALCHEMY_API_KEY": "test-platform",
            "PYTHONUNBUFFERED": "1",
            "PYTHONPATH": str(V2_MVP),
        })
        procs.append(spawn_python(py_env, py_log))
        _wait_health("http://127.0.0.1:8001/health")
        print("[harness] python oracle :8001 ready", file=sys.stderr)

        # --- rust port on :8000 ----------------------------------------
        rs_env = os.environ.copy()
        rs_env.update({
            "KS_BIND": "127.0.0.1:8000",
            "KS_VAULT_DIR": str(vault_dir),
            "KS_SESSION_DB": str(sessions_db),
            "PYTHON_BACKEND_URL": "http://127.0.0.1:8001",
            "KS_UPSTREAM_OVERRIDE_BASE": f"http://127.0.0.1:{mock_port}",
            "OPENAI_API_KEY": "test-platform",
            "HELIUS_API_KEY": "test-platform",
            "ANTHROPIC_API_KEY": "test-platform",
            "MISTRAL_API_KEY": "test-platform",
            "COHERE_API_KEY": "test-platform",
            "GROQ_API_KEY": "test-platform",
            "ZEROX_API_KEY": "test-platform",
            "TITAN_API_KEY": "test-platform",
            "PYTH_API_KEY": "test-platform",
            "ALCHEMY_API_KEY": "test-platform",
            "SERVER_SECRET": "CHANGE-ME-IN-PROD-32-BYTES-MIN!!",
            # Inherit RUST_LOG if set so a developer can crank verbosity
            # to debug a divergence without editing the harness.
            "RUST_LOG": os.environ.get("RUST_LOG", "info"),
        })
        procs.append(spawn_rust(rs_env, rs_log))
        _wait_health("http://127.0.0.1:8000/health")
        print("[harness] rust port :8000 ready", file=sys.stderr)

        # --- run fixtures ------------------------------------------------
        rows: list[tuple[str, bool, str]] = []
        for fx in FIXTURES:
            py_resp = call("http://127.0.0.1:8001", fx)
            rs_resp = call("http://127.0.0.1:8000", fx)
            ok, detail = run_one(fx["name"], fx, py_resp, rs_resp, Path(args.dump))
            rows.append((fx["name"], ok, detail))

        # --- report ------------------------------------------------------
        passed = sum(1 for _, ok, _ in rows if ok)
        print()
        print(f"{'fixture':<36} {'result':<6} detail")
        print(f"{'-' * 36} {'-' * 6} {'-' * 50}")
        for name, ok, detail in rows:
            tag = "PASS " if ok else "FAIL "
            print(f"{name:<36} {tag:<6} {detail}")
        print()
        print(f"[harness] {passed}/{len(rows)} fixtures passed")

        if passed != len(rows):
            print(f"[harness] python log: {py_log}")
            print(f"[harness] rust log:   {rs_log}")
            print()
            print("--- python log (last 4KB) ---")
            with contextlib.suppress(Exception):
                print(py_log.read_text(errors="replace")[-4000:])
            print("--- rust log (last 4KB) ---")
            with contextlib.suppress(Exception):
                print(rs_log.read_text(errors="replace")[-4000:])
            print("--- mock upstream request log (last 30) ---")
            with MockUpstream.log_lock:
                for r in MockUpstream.request_log[-30:]:
                    print(f"  {r['method']} {r['path']} body={r['body'][:120]!r}")
            return 1
        return 0

    except Exception as e:  # noqa: BLE001
        print(f"[harness] FATAL: {e}", file=sys.stderr)
        if py_log.exists():
            print(f"--- python log tail ({py_log}) ---", file=sys.stderr)
            print(py_log.read_text(errors="replace")[-4000:], file=sys.stderr)
        if rs_log.exists():
            print(f"--- rust log tail ({rs_log}) ---", file=sys.stderr)
            print(rs_log.read_text(errors="replace")[-4000:], file=sys.stderr)
        return 1
    finally:
        cleanup()


if __name__ == "__main__":
    sys.exit(main())
