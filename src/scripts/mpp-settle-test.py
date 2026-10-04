#!/usr/bin/env python3
"""mpp-settle-test.py — direct on-chain settle verification.

Skips the HTTP API and Auth; manually seeds a stream row pointing at the
already-on-chain Stream PDA + USDC ATA, then calls settle_on_chain() to
trigger the real mpp_settle ix #26 on devnet.

Requires the env from .env.mpp + a Stream PDA already open on-chain.

Run:
    set -a; source .env.mpp; set +a
    python3 src/scripts/mpp-settle-test.py
"""
from __future__ import annotations
import os
import sys
import time
import sqlite3

# Make src/ importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from src.backend.mpp import mpp_streams, mpp_onchain

# ── on-chain addresses we already opened in the prior e2e run ────────
STREAM_PDA = "A94KzV6PquQ3mSC36K9EprYShm6AYixKjhhsJnXDfYUQ"
STREAM_USDC_ATA = "TfzENzFAhvoBRtzM1cYg3oLC53HFiHCA5VJkQLDC5gL"
AGENT_PUBKEY = "9UTmrBezGq9U6LXzKwMQgBdfxMCv5ZDXjetPJCjNtJgS"
PLATFORM_USDC_ATA = os.environ["KS_PLATFORM_USDC_ATA"]


def main() -> int:
    cfg = mpp_onchain.load_mpp_config()
    if cfg is None:
        print("✗ env not loaded — `set -a; source .env.mpp; set +a` first", file=sys.stderr)
        return 1
    print("▶ config")
    print(f"    settler         : {cfg.settler_pubkey}")
    print(f"    program_id      : {cfg.keyshield_program_id}")
    print(f"    vault_pda       : {cfg.vault_pda}")
    print(f"    platform_ata    : {cfg.platform_usdc_ata}")
    print(f"    rpc             : {cfg.rpc_url}")

    # 1) seed a stream row in the SQLite DB so settle_on_chain can find
    #    PDA + ATA via _get_stream_pda_ata().
    print("\n▶ seed mpp_streams row with on-chain addrs")
    stream = mpp_streams.open_stream(
        user_id="settle-test",
        agent_pubkey=AGENT_PUBKEY,
        agent_name="mpp-settle-test",
        upstream="openai",
        rate_per_token=1,
        rate_per_call=1000,
        settlement_interval=60,
        stream_pda=STREAM_PDA,
        stream_usdc_ata=STREAM_USDC_ATA,
    )
    stream_id = stream["id"]
    print(f"    stream_id       : {stream_id}")
    print(f"    db stream_pda   : {stream.get('streamPda', '(missing in dict)')}")

    # 2) verify _get_stream_pda_ata() reads them back
    pda, ata = mpp_streams._get_stream_pda_ata(stream_id)
    print(f"    _get_stream_pda_ata → pda={pda} ata={ata}")
    assert pda == STREAM_PDA, f"pda mismatch: {pda}"
    assert ata == STREAM_USDC_ATA, f"ata mismatch: {ata}"
    print("  ✓ DB row + lookup OK")

    # 3) submit settle ix #26 — 50_000 micro-USDC (= half of what's in the
    #    stream ATA; on-chain mpp_settle interprets `amount` as units, and
    #    debits units × cost_per_unit; cost_per_unit was set to 1 during
    #    open_stream so units == micro-USDC for this stream).
    units = 50_000
    root_hex = os.environ.get("KS_MPP_ARTIFACT_ROOT", "").strip()
    if len(root_hex) != 64:
        print(
            "✗ refusing to settle without KS_MPP_ARTIFACT_ROOT "
            "(64 hex chars). mpp_settle will not debit invoiced units "
            "that have no fulfillment artifact root.",
            file=sys.stderr,
        )
        return 1
    artifact_root = bytes.fromhex(root_hex)
    print(f"\n▶ settle_on_chain({stream_id}, micro_usdc={units})")
    t0 = time.perf_counter()
    outcome = mpp_streams.settle_on_chain(stream_id, units, artifact_root)
    debited = outcome.debited_micro_usdc
    dt = time.perf_counter() - t0
    print(f"    mode            : {outcome.mode}")
    print(f"    returned        : {debited} micro-USDC")
    print(f"    elapsed         : {dt:.2f}s")

    # 4) inspect mpp_settle_attempts to surface tx sig / error
    conn = mpp_streams._db()
    row = conn.execute(
        "SELECT id, requested_micro_usdc, tx_signature, debited_micro_usdc, "
        "       success, error, ts "
        "  FROM mpp_settle_attempts WHERE stream_id = ? "
        "ORDER BY ts DESC, id DESC LIMIT 1",
        (stream_id,),
    ).fetchone()
    conn.close()
    if not row:
        print("  ✗ no mpp_settle_attempts row recorded — settle short-circuited")
        return 1
    _id, req, sig, deb, success, err, ts = row
    print("\n▶ mpp_settle_attempts row")
    print(f"    requested       : {req} micro-USDC")
    print(f"    debited         : {deb} micro-USDC")
    print(f"    success         : {bool(success)}")
    print(f"    tx_signature    : {sig or '(none)'}")
    if err:
        print(f"    error           : {err}")
    if sig:
        print(f"    explorer        : https://explorer.solana.com/tx/{sig}?cluster=devnet")
    return 0 if success else 1


if __name__ == "__main__":
    raise SystemExit(main())
