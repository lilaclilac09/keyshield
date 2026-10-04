"""Drive /proxy against a fault-injecting mock upstream.

Used by tests/proxy_fault_injection.test.ts. Chain env is cleared so
a rejected or truncated body cannot sign an mpp_settle receipt.
"""

from __future__ import annotations

import json
import os
import sys

for key in ("KS_MPP_SETTLER_KEY", "KS_PLATFORM_USDC_ATA", "KS_KEYSHIELD_PROGRAM_ID"):
    os.environ.pop(key, None)

os.environ.setdefault("SERVER_SECRET", "KS-FAULT-INJECTION-SECRET-32B!!")


def _snapshot(user_id: str) -> dict:
    from src.backend.mpp import mpp_streams

    rows = mpp_streams.list_streams(user_id)["streams"]
    row = rows[0]
    return {
        "id": row["id"],
        "status": row["status"],
        "pending": row["pending_micro_usdc"],
        "settled": row["settled_micro_usdc"],
        "held": row["held_micro_usdc"],
        "escrow": row["escrow_micro_usdc"],
        "cap": row["max_total_micro_usdc"],
    }


def _attempts(stream_id: int) -> dict:
    from src.backend.mpp import mpp_streams

    conn = mpp_streams._db()
    try:
        signed = conn.execute(
            "SELECT COUNT(*) FROM mpp_settle_attempts "
            "WHERE stream_id = ? AND tx_signature IS NOT NULL AND tx_signature != ''",
            (int(stream_id),),
        ).fetchone()[0]
        ok = conn.execute(
            "SELECT COUNT(*) FROM mpp_settle_attempts WHERE stream_id = ? AND success = 1",
            (int(stream_id),),
        ).fetchone()[0]
        artifacts = conn.execute(
            "SELECT COALESCE(SUM(tokens), 0), COALESCE(SUM(micro_usdc), 0), COUNT(*) "
            "FROM mpp_artifacts WHERE stream_id = ?",
            (int(stream_id),),
        ).fetchone()
        return {
            "signed": int(signed),
            "success": int(ok),
            "artifact_tokens": int(artifacts[0]),
            "artifact_micro": int(artifacts[1]),
            "artifact_rows": int(artifacts[2]),
        }
    finally:
        conn.close()


def main() -> None:
    if len(sys.argv) < 3:
        raise SystemExit("usage: proxy_fault_injection_driver.py <mock-base> <mode>")
    mock_base = sys.argv[1]
    mode = sys.argv[2]

    import httpx
    from fastapi.testclient import TestClient

    from src.backend.app import app
    from src.backend.auth import session as sess_mod
    from src.backend.mpp import mpp_streams
    from src.backend.proxy import api_router
    from src.backend.proxy.velocity import limiter

    limiter.reset()
    api_router._CLIENTS["openai"] = httpx.AsyncClient(
        base_url=mock_base,
        timeout=5.0,
        http2=False,
    )

    token = sess_mod.create_token("alice", "fault-injection")
    stream = mpp_streams.open_stream(
        user_id="alice",
        agent_pubkey="agent-fault",
        agent_name="bot",
        upstream="openai",
        rate_per_token=2,
        rate_per_call=1000,
        settlement_interval=3600,
        max_total_micro_usdc=50_000,
    )
    before = _snapshot("alice")

    want_stream = mode == "disconnect"
    headers = {
        "Authorization": f"Bearer {token}",
        "X-Upstream-API-Key": "sk-fault-test",
        "X-Mpp-Stream-Id": str(stream["id"]),
        "X-Mpp-Estimate-Micro-Usdc": "5000",
        "X-Fault-Mode": mode,
        "Accept": "text/event-stream" if want_stream else "application/json",
        "Content-Type": "application/json",
    }
    body = {"model": "mock", "stream": want_stream, "messages": [{"role": "user", "content": "hi"}]}

    client = TestClient(app)
    response = client.post(
        f"/proxy/openai/fault/{mode}",
        headers=headers,
        json=body,
    )

    after = _snapshot("alice")
    stats = _attempts(stream["id"])

    # A rejected body must not be capturable. Attempting a dummy
    # settlement proves the chain stub never signs a receipt.
    chain = None
    try:
        mpp_streams.settle_on_chain(int(stream["id"]), 1, bytes(32))
        chain = "signed"
    except Exception as exc:  # noqa: BLE001
        chain = type(exc).__name__ + ":" + str(exc)

    quiet = mpp_streams.settle_stream("alice", int(stream["id"]))
    final = _snapshot("alice")
    final_stats = _attempts(stream["id"])

    print(
        json.dumps(
            {
                "mode": mode,
                "status": response.status_code,
                "meter": response.headers.get("x-ks-mpp-meter"),
                "hold": response.headers.get("x-ks-mpp-hold"),
                "complete": response.headers.get("x-ks-stream-complete"),
                "body_len": len(response.content),
                "before": before,
                "after": after,
                "final": final,
                "attempts": stats,
                "final_attempts": final_stats,
                "chain": chain,
                "just_settled": quiet.get("just_settled_micro_usdc"),
            }
        )
    )


if __name__ == "__main__":
    main()
