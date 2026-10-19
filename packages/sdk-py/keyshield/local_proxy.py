"""keyshield-proxy: a ZK-mode proxy that runs on your (or your agent's) machine.

Agents call http://127.0.0.1:8787/vproxy/<upstream>/<path> exactly like the
hosted /vproxy, using the printed local token as their API key. For each
call the proxy decrypts the provider key here (root R + server share S),
adds it to the upstream request and forgets it. The KeyShield server never
sees the key or the request. Revoking the proxy's KeyShield token stops new
decrypts within the share cache window (<= 60 s).

Unlike the hosted proxy, this one has no server-side guardrails: spend caps,
the 5xx freeze, MPP metering and the Helius RPC cache don't run here.
"""

from __future__ import annotations

import hmac
import secrets
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

import httpx

from .zk import Revoked, ZkClient, ZkError

# Mirrors src/backend/proxy/api_router.py for the providers ZK mode covers.
PROVIDERS: dict[str, dict] = {
    "openai": {"base": "https://api.openai.com", "auth": "bearer"},
    "anthropic": {
        "base": "https://api.anthropic.com",
        "auth": "header",
        "header": "x-api-key",
        "extra": {"anthropic-version": "2023-06-01"},
    },
    "openrouter": {"base": "https://openrouter.ai", "auth": "bearer"},
    "groq": {"base": "https://api.groq.com", "auth": "bearer"},
    "mistral": {"base": "https://api.mistral.ai", "auth": "bearer"},
    "cohere": {"base": "https://api.cohere.ai", "auth": "bearer"},
    "nvidia": {"base": "https://integrate.api.nvidia.com", "auth": "bearer"},
    "helius": {
        "base": "https://mainnet.helius-rpc.com",
        "auth": "query",
        "param": "api-key",
    },
}

_HOP = {
    "host",
    "authorization",
    "x-api-key",
    "x-upstream-api-key",
    "content-length",
    "connection",
    "keep-alive",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "accept-encoding",
}
_ALLOWED_HOSTS = {"127.0.0.1", "localhost", "[::1]"}


def build_upstream(upstream: str, rest: str, query: str, key: str) -> tuple[str, dict]:
    cfg = PROVIDERS[upstream]
    headers = dict(cfg.get("extra", {}))
    url = f"{cfg['base']}/{rest.lstrip('/')}"
    if query:
        url += "?" + query
    if cfg["auth"] == "bearer":
        headers["authorization"] = f"Bearer {key}"
    elif cfg["auth"] == "header":
        headers[cfg["header"]] = key
    elif cfg["auth"] == "query":
        url += ("&" if "?" in url else "?") + f"{cfg['param']}={key}"
    return url, headers


def make_handler(zk: ZkClient, local_token: str, upstream_http: httpx.Client):
    class Handler(BaseHTTPRequestHandler):
        server_version = "keyshield-proxy/zk-v1"
        protocol_version = "HTTP/1.1"

        def log_message(self, fmt, *args):  # keep keys and URLs with keys out of logs
            sys.stderr.write(
                f"keyshield-proxy: {self.command} {self.path.split('?')[0]}\n"
            )

        def _send_json(self, status: int, body: str) -> None:
            data = body.encode()
            self.send_response(status)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def _authorized(self) -> bool:
            host = (self.headers.get("host") or "").rsplit(":", 1)[0].lower()
            if host not in _ALLOWED_HOSTS:
                return False  # blocks DNS-rebinding from web pages
            supplied = self.headers.get("x-api-key") or ""
            auth = self.headers.get("authorization") or ""
            if auth.lower().startswith("bearer "):
                supplied = auth[7:].strip()
            return bool(supplied) and hmac.compare_digest(supplied, local_token)

        def _handle(self) -> None:
            if not self._authorized():
                return self._send_json(401, '{"error":"local token required"}')
            parts = urlsplit(self.path)
            segs = parts.path.lstrip("/").split("/", 2)
            if segs and segs[0] == "vproxy":
                segs = segs[1:]
            else:
                segs = parts.path.lstrip("/").split("/", 1)
            if not segs or segs[0] not in PROVIDERS:
                return self._send_json(404, '{"error":"unknown upstream"}')
            upstream = segs[0]
            rest = segs[1] if len(segs) > 1 else ""
            length = int(self.headers.get("content-length") or 0)
            body = self.rfile.read(length) if length else b""
            try:
                key = zk.key_for(upstream)
            except Revoked:
                return self._send_json(401, '{"error":"invalid token"}')
            except ZkError as exc:
                detail = _js(exc)
                return self._send_json(
                    409, f'{{"error":"zk_unavailable","detail":{detail}}}'
                )
            url, inject = build_upstream(upstream, rest, parts.query, key)
            del key
            fwd = {k: v for k, v in self.headers.items() if k.lower() not in _HOP}
            fwd.update(inject)
            try:
                with upstream_http.stream(
                    self.command, url, headers=fwd, content=body
                ) as r:
                    self.send_response(r.status_code)
                    for k, v in r.headers.items():
                        if k.lower() not in _HOP and k.lower() != "content-encoding":
                            self.send_header(k, v)
                    self.send_header("transfer-encoding", "chunked")
                    self.send_header("x-ks-key-type", "zk-local")
                    self.end_headers()
                    for chunk in r.iter_bytes():
                        if chunk:
                            self.wfile.write(b"%x\r\n%s\r\n" % (len(chunk), chunk))
                            self.wfile.flush()
                    self.wfile.write(b"0\r\n\r\n")
            except httpx.HTTPError:
                return self._send_json(502, '{"error":"upstream unreachable"}')

        do_GET = do_POST = do_PUT = do_PATCH = do_DELETE = _handle

    return Handler


def _js(exc: Exception) -> str:
    import json

    return json.dumps(str(exc))


def serve(
    zk: ZkClient,
    *,
    host: str = "127.0.0.1",
    port: int = 8787,
    local_token: str | None = None,
    upstream_http: httpx.Client | None = None,
) -> tuple[ThreadingHTTPServer, str]:
    """Start the proxy in a background thread. Returns (server, local_token)."""
    if host not in ("127.0.0.1", "localhost", "::1"):
        raise ZkError("keyshield-proxy only listens on loopback")
    token = local_token or ("ksl_" + secrets.token_urlsafe(24))
    up = upstream_http or httpx.Client(timeout=httpx.Timeout(120, connect=10))
    httpd = ThreadingHTTPServer((host, port), make_handler(zk, token, up))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, token
