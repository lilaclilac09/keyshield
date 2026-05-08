"""
Shared pytest fixtures for KeyShield v2-MVP.
Loads v2-mvp/src/ so that `from src import ...` resolves to the migrated code.
"""

import os, sys, pytest, tempfile, asyncio, shutil
from pathlib import Path
from typing import Generator

_repo = Path(__file__).parent.parent.parent.resolve()  # v2-mvp/
_src_parent = str(_repo / "src")
if _src_parent not in sys.path:
    sys.path.insert(0, _src_parent)

# Import migrated modules (after path setup)
from src.vault import vault, vault_new as _vault_new  # noqa: E402
from src.auth import session  # noqa: E402
from src.agents import agents  # noqa: E402
from src.billing import usage  # noqa: E402

# Expose at the module level for tests that expect `import src.vault` etc.
vault_new = _vault_new


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _clean_agent_db() -> None:
    """Remove test agent data between runs."""
    db_path = Path(__file__).parent.parent / "src" / "data" / "agents.db"
    if not db_path.exists():
        db_path = Path(__file__).parent.parent / "data" / "agents.db"
    if db_path.exists():
        conn = __import__('sqlite3').connect(str(db_path))
        conn.execute("DELETE FROM agent_keys")
        conn.execute("DELETE FROM agent_revocations")
        conn.commit()
        conn.close()


def _clean_vault_data() -> None:
    """Remove test vault data between runs."""
    vault_dir = Path(__file__).parent.parent / "vault"
    if vault_dir.exists():
        for user_dir in vault_dir.iterdir():
            if user_dir.is_dir():
                shutil.rmtree(str(user_dir))


def _clean_all_test_data() -> None:
    """Clean all test data (called before session-scoped fixture)."""
    _clean_agent_db()
    _clean_vault_data()


@pytest.fixture(scope="session", autouse=True)
def _init_dbs():
    """Ensure databases exist before any tests run."""
    _clean_all_test_data()
    vault.VAULT_DIR.mkdir(parents=True, exist_ok=True)
    Path("data").mkdir(exist_ok=True)
    yield


@pytest.fixture(autouse=True)
def clean_dbs(monkeypatch):
    """Clean caches between tests."""
    _clean_agent_db()
    yield
    _clean_agent_db()


# ── Sync-compatible test client for httpx 0.28+ ASGI ───────────────────────

class _App:
    """Minimal ASGI app with routes."""
    def __init__(self):
        from starlette.routing import Router
        self._router = Router()
    
    async def __call__(self, scope, receive, send):
        await self._router(scope, receive, send)

    def add_route(self, path, handler, methods=None):
        from starlette.routing import Route
        route = Route(path, handler, methods=methods or ["GET"])
        self._router.routes.append(route)


class _SyncASGIClient:
    """Wraps httpx.AsyncClient + ASGITransport with sync .post(), .get(), .close()."""

    def __init__(self, app):
        from httpx import ASGITransport, AsyncClient
        self._transport = ASGITransport(app=app)
        self._client = AsyncClient(transport=self._transport, base_url="http://test")

    def _run(self, coro):
        """Run coroutine on a short-lived event loop."""
        try:
            return asyncio.get_running_loop().run_until_complete(coro)
        except RuntimeError:
            return asyncio.run(coro)

    def post(self, url, **kwargs):
        return self._run(self._client.post(url, **kwargs))

    def get(self, url, **kwargs):
        return self._run(self._client.get(url, **kwargs))

    def put(self, url, **kwargs):
        return self._run(self._client.put(url, **kwargs))

    def delete(self, url, **kwargs):
        return self._run(self._client.delete(url, **kwargs))

    def close(self):
        asyncio.run(self._client.aclose())


# ── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture()
def client() -> Generator:
    """FastAPI test client for auth/route endpoints."""
    from starlette.responses import JSONResponse
    from starlette.requests import Request
    from src.auth import session as sess

    async def login_route(request: Request):
        body = await request.json()
        user_id = body["userId"]
        password = body.get("password", "default")
        token = sess.create_token(user_id, password)
        return JSONResponse({"token": token})

    async def store_key_route(request: Request):
        auth = request.headers.get("Authorization", "")
        body = await request.json()
        sess_info = sess.get(auth.replace("Bearer ", ""))
        if not sess_info:
            return JSONResponse({"error": "not authenticated"}, status_code=401)
        from src.vault import store as vault_store
        vault_store(sess_info["user_id"], body["upstream"], body["apiKey"], password=sess_info["password"])
        return JSONResponse({"ok": True})

    async def list_keys_route(request: Request):
        auth = request.headers.get("Authorization", "")
        sess_info = sess.get(auth.replace("Bearer ", ""))
        if not sess_info:
            return JSONResponse({"error": "not authenticated"}, status_code=401)
        from src.vault import list_keys as vault_list
        keys = vault_list(sess_info["user_id"])
        return JSONResponse({"keys": keys})

    async def agent_register_route(request: Request):
        auth = request.headers.get("Authorization", "")
        body = await request.json()
        sess_info = sess.get(auth.replace("Bearer ", ""))
        owner = sess_info["user_id"] if sess_info else body.get("owner_wallet", "test")
        from src.agents import register as agent_register
        agent_register(owner, body["pubkeyB58"], name=body.get("name", "agent"))
        return JSONResponse({"ok": True})

    async def agent_list_route(request: Request):
        auth = request.headers.get("Authorization", "")
        sess_info = sess.get(auth.replace("Bearer ", ""))
        owner = sess_info["user_id"] if sess_info else "test"
        from src.agents import list_agents as agent_list
        ag_list = agent_list(owner)
        return JSONResponse({"agents": ag_list})

    async def proxy_openai(request: Request):
        return JSONResponse({"models": []})

    app = _App()
    app.add_route("/auth/login", login_route, ["POST"])
    app.add_route("/manage/store", store_key_route, ["POST"])
    app.add_route("/manage/list", list_keys_route, ["GET"])
    app.add_route("/agents/register", agent_register_route, ["POST"])
    app.add_route("/agents/list", agent_list_route, ["GET"])
    app.add_route("/proxy/openai/v1/models", proxy_openai, ["POST"])
    
    c = _SyncASGIClient(app)
    try:
        yield c
    finally:
        c.close()


@pytest.fixture()
def login(client) -> str:
    """Create a session and return the token."""
    r = client.post("/auth/login", json={"userId": "alice", "password": "pw"})
    return r.json()["token"]
