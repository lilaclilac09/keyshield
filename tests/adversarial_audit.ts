/**
 * KeyShield adversarial settlement audit.
 *
 * The Solana program is pinocchio, not Anchor (`@coral-xyz/anchor` is
 * not a dependency), and this environment cannot run Mollusk without
 * `cargo-build-sbf`. These cases drive the Python settlement ledger,
 * which enforces the same rejects the program returns:
 *
 *   BudgetExceeded          on-chain 6100
 *   NonceReused             on-chain 6101
 *   StreamAlreadyClosed     on-chain PaymentStreamInactive 6052
 *   empty / zero artifact   on-chain UnverifiedFulfillment 6108
 *
 * Chain env is unset, so settlement stays in stub mode: the debit is
 * the ledger write, and a zero artifact root is refused before any
 * settle attempt row is stored.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert, expect } from "chai";
import { describe, it } from "vitest";

const PYTHON = process.env.KS_PYTHON ?? "/workspace/.venv/bin/python";
const ROOT = "/workspace";

const DRIVER = String.raw`
import json, os, sys, threading

for key in ("KS_MPP_SETTLER_KEY", "KS_PLATFORM_USDC_ATA", "KS_KEYSHIELD_PROGRAM_ID"):
    os.environ.pop(key, None)

from src.backend.mpp import mpp_streams

def explain(exc):
    return type(exc).__name__ + ":" + str(exc)

def snapshot():
    rows = mpp_streams.list_streams("alice")["streams"]
    if not rows:
        return None
    row = rows[0]
    return {
        "id": row["id"],
        "status": row["status"],
        "pending": row["pending_micro_usdc"],
        "settled": row["settled_micro_usdc"],
        "escrow": row["escrow_micro_usdc"],
        "cap": row["max_total_micro_usdc"],
    }

def debit_total(stream_id):
    conn = mpp_streams._db()
    try:
        row = conn.execute(
            "SELECT COALESCE(SUM(micro_usdc), 0) FROM mpp_events WHERE stream_id = ? AND kind = 'settle'",
            (int(stream_id),),
        ).fetchone()
        ok = conn.execute(
            "SELECT COUNT(*) FROM mpp_settle_attempts WHERE success = 1"
        ).fetchone()
        return int(row[0]), int(ok[0])
    finally:
        conn.close()

def payload(text):
    return json.dumps({
        "choices": [{"message": {"content": text}}],
        "usage": {"total_tokens": 1},
    }).encode()

def open_stream(rate_per_call, cap):
    return mpp_streams.open_stream(
        user_id="alice",
        agent_pubkey="agent-1",
        agent_name="bot",
        upstream="openai",
        rate_per_token=0,
        rate_per_call=rate_per_call,
        settlement_interval=3600,
        max_total_micro_usdc=cap,
    )

def record(stream_id, text, calls=1, status_code=200, body=None):
    return mpp_streams.record_usage(
        "alice",
        stream_id,
        calls,
        0,
        status_code=status_code,
        body=payload(text) if body is None else body,
    )

scenario = sys.argv[1]
out = {}

if scenario == "concurrent":
    stream = open_stream(800, 1000)
    first = record(stream["id"], "alpha-receipt")
    second = record(stream["id"], "beta-receipt")
    assert first["artifact_hash"] != second["artifact_hash"]
    assert second["pending_micro_usdc"] == 1600
    assert second["settled_micro_usdc"] == 0
    results = []
    errors = []
    def settle(digest):
        try:
            settled = mpp_streams.settle_receipt("alice", stream["id"], digest)
            results.append(settled["just_settled_micro_usdc"])
        except Exception as exc:
            errors.append(explain(exc))
    threads = [
        threading.Thread(target=settle, args=(first["artifact_hash"],)),
        threading.Thread(target=settle, args=(second["artifact_hash"],)),
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    final = snapshot()
    debited, successes = debit_total(stream["id"])
    out = {
        "results": results,
        "errors": errors,
        "final": final,
        "debited": debited,
        "chain_successes": successes,
    }

elif scenario == "empty":
    stream = open_stream(1000, 1000)
    rejected = []
    cases = [
        (b"", 200),
        (payload("error-status"), 500),
        (b'{"error":{"message":"upstream failed"}}', 200),
    ]
    for body, status in cases:
        try:
            record(stream["id"], "unused", status_code=status, body=body)
            rejected.append("no-error")
        except Exception as exc:
            rejected.append(explain(exc))
    chain = None
    try:
        mpp_streams.settle_on_chain(stream["id"], 1, bytes(32))
    except Exception as exc:
        chain = explain(exc)
    unknown = None
    try:
        mpp_streams.settle_receipt("alice", stream["id"], "ab" * 32)
    except Exception as exc:
        unknown = explain(exc)
    quiet = mpp_streams.settle_stream("alice", stream["id"])
    final = snapshot()
    debited, successes = debit_total(stream["id"])
    out = {
        "rejected": rejected,
        "chain": chain,
        "unknown": unknown,
        "just_settled": quiet["just_settled_micro_usdc"],
        "final": final,
        "debited": debited,
        "chain_successes": successes,
    }

elif scenario == "closed":
    stream = open_stream(800, 1000)
    mpp_streams.close_stream("alice", stream["id"])
    before = snapshot()
    errors = {}
    try:
        record(stream["id"], "after-close")
        errors["record"] = "no-error"
    except Exception as exc:
        errors["record"] = explain(exc)
    try:
        mpp_streams.settle_stream("alice", stream["id"])
        errors["settle"] = "no-error"
    except Exception as exc:
        errors["settle"] = explain(exc)
    try:
        mpp_streams.settle_receipt("alice", stream["id"], "cd" * 32)
        errors["receipt"] = "no-error"
    except Exception as exc:
        errors["receipt"] = explain(exc)
    after = snapshot()
    debited, successes = debit_total(stream["id"])
    out = {
        "before": before,
        "after": after,
        "errors": errors,
        "debited": debited,
        "chain_successes": successes,
    }

elif scenario == "replay":
    stream = open_stream(800, 5000)
    recorded = record(stream["id"], "one-receipt")
    digest = recorded["artifact_hash"]
    first = mpp_streams.settle_receipt("alice", stream["id"], digest)
    replay = None
    try:
        mpp_streams.settle_receipt("alice", stream["id"], digest)
        replay = "no-error"
    except Exception as exc:
        replay = explain(exc)
    remeter = None
    try:
        record(stream["id"], "one-receipt")
        remeter = "no-error"
    except Exception as exc:
        remeter = explain(exc)
    again = mpp_streams.settle_stream("alice", stream["id"])
    final = snapshot()
    debited, successes = debit_total(stream["id"])
    out = {
        "just_settled": first["just_settled_micro_usdc"],
        "replay": replay,
        "remeter": remeter,
        "second_batch": again["just_settled_micro_usdc"],
        "final": final,
        "debited": debited,
        "chain_successes": successes,
    }

else:
    raise SystemExit("unknown scenario " + scenario)

print(json.dumps(out))
`;

interface Balances {
  id: number;
  status: string;
  pending: number;
  settled: number;
  escrow: number | null;
  cap: number | null;
}

function run(scenario: string): Record<string, unknown> {
  const dir = mkdtempSync(join(tmpdir(), "ks-adv-"));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PYTHONPATH: ROOT,
    KS_MPP_DB: join(dir, "mpp.db"),
    KS_MPP_RACE_WINDOW_MS: scenario === "concurrent" ? "250" : "",
  };
  delete env.KS_MPP_SETTLER_KEY;
  delete env.KS_PLATFORM_USDC_ATA;
  delete env.KS_KEYSHIELD_PROGRAM_ID;
  const stdout = execFileSync(PYTHON, ["-c", DRIVER, scenario], {
    cwd: ROOT,
    env,
    encoding: "utf-8",
  });
  return JSON.parse(stdout) as Record<string, unknown>;
}

describe("KeyShield Adversarial & Settlement Verification Audit", () => {
  it("REJECT: Concurrent debits exceeding hard budget cap", () => {
    const report = run("concurrent");
    const results = report.results as number[];
    const errors = report.errors as string[];
    const final = report.final as Balances;

    expect(results).to.deep.equal([800]);
    expect(errors).to.have.length(1);
    expect(errors[0]).to.contain("BudgetExceeded");
    expect(final.settled).to.equal(800);
    expect(final.pending).to.equal(800);
    expect(final.escrow).to.equal(200);
    expect(final.cap).to.equal(1000);
    expect(report.debited).to.equal(800);
    assert.isAtLeast(final.settled, 0);
    assert.isAtLeast(final.pending, 0);
    assert.isAtLeast(final.escrow ?? -1, 0);
    assert.isAtMost(final.settled, final.cap ?? 0);
  });

  it("REJECT: Settle payment when artifact is empty or unverified", () => {
    const report = run("empty");
    const rejected = report.rejected as string[];
    const final = report.final as Balances;

    expect(rejected).to.have.length(3);
    for (const reason of rejected) {
      expect(reason).to.contain("FulfillmentRejected");
    }
    expect(rejected.join("\n")).to.contain("empty payload");
    expect(rejected.join("\n")).to.contain("upstream error status");
    expect(report.chain).to.be.a("string").and.to.contain("FulfillmentRejected");
    expect(String(report.chain)).to.contain("non-zero");
    expect(report.unknown).to.be.a("string").and.to.contain("unverified artifact");
    expect(report.just_settled).to.equal(0);
    expect(final.pending).to.equal(0);
    expect(final.settled).to.equal(0);
    expect(final.escrow).to.equal(1000);
    expect(report.debited).to.equal(0);
    expect(report.chain_successes).to.equal(0);
  });

  it("REJECT: Mutations on closed or terminated streams", () => {
    const report = run("closed");
    const before = report.before as Balances;
    const after = report.after as Balances;
    const errors = report.errors as Record<string, string>;

    expect(before.status).to.equal("closed");
    expect(before.pending).to.equal(0);
    expect(before.settled).to.equal(0);
    for (const key of ["record", "settle", "receipt"]) {
      expect(errors[key], key).to.contain("StreamAlreadyClosed");
    }
    expect(after).to.deep.equal(before);
    expect(report.debited).to.equal(0);
    expect(report.chain_successes).to.equal(0);
  });

  it("REJECT: Replayed settlement references and receipt ID manipulation", () => {
    const report = run("replay");
    const final = report.final as Balances;

    expect(report.just_settled).to.equal(800);
    expect(String(report.replay)).to.contain("NonceReused");
    expect(String(report.remeter)).to.contain("artifact already metered");
    expect(report.second_batch).to.equal(0);
    expect(final.settled).to.equal(800);
    expect(final.pending).to.equal(0);
    expect(final.escrow).to.equal(4200);
    expect(report.debited).to.equal(800);
    assert.isAtLeast(final.settled, 0);
    assert.isAtLeast(final.escrow ?? -1, 0);
  });
});
