"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  KeyRound,
  Lock,
  RadioTower,
  Shield,
  Wallet,
  XCircle,
} from "lucide-react";

const PROGRAM_ID = "41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j";
const VERIFIED_TX =
  "678bqTSq4gYspz2TWwdK3wCzZwEHuuDqseDUS2NcEPVQ45472iNPRykVhK6Dq4nPmbLfDKKSiUx2nrT6XTQc";
const CLUSTER = "Devnet";
const REQUEST_COST = 0.005;
const INITIAL_SLOT_WINDOW = 32;

const STATES = [
  "IDLE",
  "HTTP_402_INTERCEPTED",
  "HOLD_LOCKED",
  "STREAMING_VERIFYING",
  "SETTLED_CAPTURED",
  "CLAWBACK_TRIGGERED",
] as const;
type MachineState = (typeof STATES)[number];
type UpstreamTarget = "scvd.store" | "custom-agent-proxy";
type FaultMode = "none" | "http502" | "truncated";

type WireLog = {
  at: string;
  level: "INFO" | "WARN" | "ERROR" | "OK";
  line: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fmtUsd = (n: number) => n.toFixed(4);
const slotToSeconds = (slots: number) => (slots * 0.4).toFixed(1);
const txLink = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

function maskKey(input: string) {
  if (!input) return "sk-or-v1-••••••••••••3f9a";
  const cleaned = input.trim();
  if (cleaned.length <= 8) return `${cleaned.slice(0, 2)}••••`;
  return `${cleaned.slice(0, 8)}••••••••••••${cleaned.slice(-4)}`;
}

function jitterMs() {
  return 42 + Math.floor(Math.random() * 17);
}

function nowStamp() {
  return new Date().toISOString().slice(11, 23);
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(payload: string) {
  const data = new TextEncoder().encode(payload);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(hash));
}

export default function Page() {
  const [activeTab, setActiveTab] = useState<"priority" | "secondary">("priority");
  const [state, setState] = useState<MachineState>("IDLE");
  const [target, setTarget] = useState<UpstreamTarget>("scvd.store");
  const [faultMode, setFaultMode] = useState<FaultMode>("none");
  const [latencyMs, setLatencyMs] = useState<number>(jitterMs());
  const [slotRemaining, setSlotRemaining] = useState<number>(INITIAL_SLOT_WINDOW);

  const [solBalance] = useState<number>(2.45);
  const [usdcBalance] = useState<number>(50.0);
  const [spendCap, setSpendCap] = useState<string>("10.0000");
  const [spent, setSpent] = useState<number>(0.1250);

  const [apiKeyInput, setApiKeyInput] = useState<string>("sk-or-v1-demo-key-8ed13f9a");
  const [prfEnabled, setPrfEnabled] = useState<boolean>(true);
  const [aesStatus, setAesStatus] = useState<string>("AES-256-GCM derived from hardware salt");

  const [expectedHash, setExpectedHash] = useState<string>("—");
  const [receivedHash, setReceivedHash] = useState<string>("—");
  const [txSig, setTxSig] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [logOpen, setLogOpen] = useState<boolean>(true);
  const [logs, setLogs] = useState<WireLog[]>([
    { at: nowStamp(), level: "INFO", line: `[BOOT] KeyShield demo ready on ${CLUSTER}` },
  ]);

  const cancelRef = useRef(false);

  const capNum = Number.parseFloat(spendCap) || 0;
  const remaining = Math.max(capNum - spent, 0);
  const progressPct = capNum > 0 ? Math.min((spent / capNum) * 100, 100) : 0;

  const stateIndex = STATES.indexOf(state);
  const coreFlow = STATES.slice(0, 5);

  const requestLabel = useMemo(
    () => (target === "scvd.store" ? "scvd.store (x402 / 0.005 USDC)" : "Custom Agent Proxy"),
    [target],
  );

  function pushLog(level: WireLog["level"], line: string) {
    setLogs((prev) => [...prev.slice(-199), { at: nowStamp(), level, line }]);
  }

  function resetTelemetry() {
    setExpectedHash("—");
    setReceivedHash("—");
    setTxSig(null);
    setSlotRemaining(INITIAL_SLOT_WINDOW);
  }

  async function runExecution() {
    if (isRunning) return;

    cancelRef.current = false;
    setIsRunning(true);
    resetTelemetry();

    const payloadChunks = [
      "chunk#01:deterministic-session-proof",
      "chunk#02:artifact-metadata",
      "chunk#03:fulfillment-body",
      "chunk#04:terminal-capture",
    ];
    const expectedPayload = payloadChunks.join("|");

    try {
      setState("HTTP_402_INTERCEPTED");
      pushLog("WARN", `[x402] CHALLENGE DETECTED: amount=${REQUEST_COST.toFixed(4)}USDC target=${target}`);
      await sleep(250);
      if (cancelRef.current) return;

      setState("HOLD_LOCKED");
      pushLog("INFO", `[ESCROW] HOLD_LOCKED slot_window=${INITIAL_SLOT_WINDOW} (~${slotToSeconds(INITIAL_SLOT_WINDOW)}s)`);
      await sleep(280);
      if (cancelRef.current) return;

      setState("STREAMING_VERIFYING");
      pushLog("INFO", `[STREAM] START target=${requestLabel}`);
      const expected = await sha256Hex(expectedPayload);
      setExpectedHash(expected);

      if (faultMode === "http502") {
        await sleep(350);
        setReceivedHash("HTTP_502_ABORT");
        pushLog("ERROR", "[VERIFY] UPSTREAM 502 -> ABORT HOLD");
        setState("CLAWBACK_TRIGGERED");
        pushLog("ERROR", "[ESCROW] CLAWBACK_TRIGGERED amount=0.0000USDC");
        return;
      }

      const ingest =
        faultMode === "truncated" ? payloadChunks.slice(0, payloadChunks.length - 1) : payloadChunks;
      const received: string[] = [];

      for (const chunk of ingest) {
        if (cancelRef.current) return;
        received.push(chunk);
        const rolling = await sha256Hex(received.join("|"));
        setReceivedHash(rolling);
        pushLog("INFO", `[STREAM] ${chunk}`);
        await sleep(220);
      }

      const finalHash = await sha256Hex(received.join("|"));
      setReceivedHash(finalHash);

      if (finalHash === expected) {
        setState("SETTLED_CAPTURED");
        setSpent((v) => Number((v + REQUEST_COST).toFixed(4)));
        setTxSig(VERIFIED_TX);
        pushLog("OK", `[VERIFY] SHA256 MATCH ${finalHash.slice(0, 18)}…`);
        pushLog("OK", `[SOLANA] CAPTURE CONFIRMED tx=${VERIFIED_TX.slice(0, 16)}…`);
      } else {
        setState("CLAWBACK_TRIGGERED");
        pushLog("ERROR", `[VERIFY] HASH MISMATCH exp=${expected.slice(0, 12)}… got=${finalHash.slice(0, 12)}…`);
        pushLog("ERROR", "[ESCROW] UNILATERAL_CLAWBACK -> charged=0.0000USDC");
      }
    } finally {
      setIsRunning(false);
    }
  }

  function panicRevoke() {
    cancelRef.current = true;
    setIsRunning(false);
    setState("IDLE");
    resetTelemetry();
    pushLog("WARN", "[POLICY] PANIC_REVOKE: all active session allowances revoked");
  }

  useEffect(() => {
    const id = setInterval(() => setLatencyMs(jitterMs()), 900);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (state !== "HOLD_LOCKED" && state !== "STREAMING_VERIFYING") return;
    const id = setInterval(() => {
      setSlotRemaining((prev) => {
        const next = Math.max(prev - 1, 0);
        if (next === 0 && !cancelRef.current) {
          setState("CLAWBACK_TRIGGERED");
          pushLog("ERROR", "[ESCROW] AUTO_CLAWBACK: slot window expired");
        }
        return next;
      });
    }, 400);
    return () => clearInterval(id);
  }, [state]);

  useEffect(() => {
    if (!prfEnabled) {
      setAesStatus("PRF disabled (demo mode)");
      return;
    }
    let mounted = true;
    (async () => {
      const derived = await sha256Hex(`webauthn-prf:${apiKeyInput}:${Date.now()}`);
      if (mounted) setAesStatus(`AES-256-GCM derived · salt=${derived.slice(0, 12)}…`);
    })();
    return () => {
      mounted = false;
    };
  }, [prfEnabled, apiKeyInput]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <main className="mx-auto max-w-7xl px-6 py-8">
        <header className="border border-zinc-800 bg-zinc-900/30 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-zinc-400">KeyShield Demo Dashboard</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
                Deterministic Non-Custodial Session Sandbox
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-zinc-300">
                Hold-Verify-Capture pipeline for pay-as-you-go autonomous agent commerce on Solana Devnet.
              </p>
            </div>
            <div className="max-w-full space-y-1 text-right font-mono text-xs text-zinc-300 md:max-w-[36rem]">
              <div className="break-all">program={PROGRAM_ID}</div>
              <div className="break-all">cluster={CLUSTER}</div>
              <div>
                verified-tx=
                <a className="text-emerald-400 underline" href={txLink(VERIFIED_TX)} target="_blank" rel="noreferrer">
                  {VERIFIED_TX.slice(0, 24)}…
                </a>
              </div>
            </div>
          </div>
        </header>

        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="border border-zinc-800 bg-zinc-900/20 p-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-400">Tabs</p>
            <div className="mt-3 space-y-2">
              <button
                type="button"
                onClick={() => setActiveTab("priority")}
                className={`w-full border px-3 py-2 text-left font-mono text-xs uppercase tracking-[0.12em] ${
                  activeTab === "priority"
                    ? "border-emerald-400 text-emerald-300 bg-emerald-950/20"
                    : "border-zinc-800 text-zinc-300 hover:border-zinc-600"
                }`}
              >
                Priority Tab
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("secondary")}
                className={`w-full border px-3 py-2 text-left font-mono text-xs uppercase tracking-[0.12em] ${
                  activeTab === "secondary"
                    ? "border-amber-400 text-amber-300 bg-amber-950/20"
                    : "border-zinc-800 text-zinc-300 hover:border-zinc-600"
                }`}
              >
                Secondary Tab
              </button>
            </div>
          </aside>

          <div className="min-w-0">
            <section className="border border-zinc-800 bg-zinc-900/20 p-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-zinc-400">State Machine</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {STATES.map((s, idx) => {
                  const active = state === s;
                  const reached = idx <= stateIndex;
                  return (
                    <div
                      key={s}
                      className={`rounded-none border px-2 py-1 font-mono text-[11px] ${
                        active
                          ? s === "SETTLED_CAPTURED"
                            ? "border-emerald-400 text-emerald-400"
                            : s === "CLAWBACK_TRIGGERED"
                              ? "border-rose-500 text-rose-400"
                              : "border-amber-400 text-amber-300"
                          : reached
                            ? "border-zinc-600 text-zinc-200"
                            : "border-zinc-800 text-zinc-500"
                      }`}
                    >
                      {s}
                    </div>
                  );
                })}
              </div>
            </section>

            {activeTab === "priority" ? (
              <section className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-3">
          <article className="border border-zinc-800 bg-zinc-900/25 p-5">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-zinc-300" />
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-400">Vault & Session Policy</p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="border border-zinc-800 bg-zinc-950 p-3">
                <p className="text-xs text-zinc-400">Devnet SOL</p>
                <p className="mt-1 text-2xl font-semibold text-white">{solBalance.toFixed(4)}</p>
              </div>
              <div className="border border-zinc-800 bg-zinc-950 p-3">
                <p className="text-xs text-zinc-400">Devnet USDC</p>
                <p className="mt-1 text-2xl font-semibold text-white">{usdcBalance.toFixed(4)}</p>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <label className="block font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-400">Session Spend Cap (USDC)</label>
              <input
                className="h-10 w-full border border-zinc-800 bg-zinc-950 px-3 font-mono text-sm text-white outline-none focus:border-zinc-500"
                value={spendCap}
                onChange={(e) => setSpendCap(e.target.value)}
              />
              <div className="flex items-center justify-between font-mono text-xs">
                <span className="text-zinc-400">Cap: {fmtUsd(capNum)} USDC</span>
                <span className="text-white">Remaining: {fmtUsd(remaining)} USDC</span>
              </div>
              <div className="h-2 border border-zinc-800 bg-zinc-950">
                <div className="h-full bg-amber-400 transition-all" style={{ width: `${Math.min(progressPct, 100)}%` }} />
              </div>
            </div>

            <div className="mt-4 border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs">
              <p className="text-zinc-400">slot window</p>
              <p className="mt-1 text-white">
                {slotRemaining} slots remaining (~{slotToSeconds(slotRemaining)}s)
              </p>
            </div>

            <button
              type="button"
              onClick={panicRevoke}
              className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 border border-rose-500 bg-rose-950/30 font-mono text-xs uppercase tracking-[0.16em] text-rose-300 hover:bg-rose-950/60"
            >
              <Shield className="h-4 w-4" />
              Unilateral Revoke / Panic Button
            </button>
          </article>

          <article className="border border-zinc-800 bg-zinc-900/25 p-5">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-zinc-300" />
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-400">Credential & Passkey PRF Isolation</p>
            </div>

            <label className="mt-4 block font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-400">
              Insert API (Upstream Bearer Key)
            </label>
            <input
              className="mt-2 h-10 w-full border border-zinc-800 bg-zinc-950 px-3 font-mono text-sm text-white outline-none focus:border-zinc-500"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="sk-or-v1-..."
            />

            <div className="mt-4 flex items-center justify-between border border-zinc-800 bg-zinc-950 px-3 py-2">
              <div>
                <p className="font-mono text-xs text-zinc-300">WebAuthn PRF Hardware Derivation</p>
                <p className="font-mono text-[11px] text-zinc-500">{aesStatus}</p>
              </div>
              <button
                type="button"
                onClick={() => setPrfEnabled((v) => !v)}
                className={`h-7 min-w-20 border px-2 font-mono text-[11px] uppercase ${
                  prfEnabled
                    ? "border-emerald-400 bg-emerald-950/40 text-emerald-400"
                    : "border-zinc-700 text-zinc-400"
                }`}
              >
                {prfEnabled ? "enabled" : "disabled"}
              </button>
            </div>

            <div className="mt-4 space-y-2">
              <div className="inline-flex items-center gap-2 border border-emerald-400 px-2 py-1 font-mono text-xs text-emerald-400">
                <Lock className="h-3.5 w-3.5" />
                Plaintext Isolation: STRICT
              </div>
              <div className="border border-zinc-800 bg-zinc-950 p-3 font-mono text-sm text-zinc-200">
                {maskKey(apiKeyInput)}
              </div>
              <p className="font-mono text-[11px] text-zinc-500">
                Key never touches chain or localStorage. Session memory only.
              </p>
            </div>
          </article>

          <article className="border border-zinc-800 bg-zinc-900/25 p-5">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-zinc-300" />
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-zinc-400">
                x402 / MPP Live Execution & Telemetry
              </p>
            </div>

            <div className="mt-4 flex items-center justify-between border border-zinc-800 bg-zinc-950 px-3 py-2">
              <div className="inline-flex items-center gap-2 font-mono text-sm">
                <span className="relative inline-flex">
                  <span className="absolute inline-flex h-2.5 w-2.5 animate-ping rounded-full bg-emerald-400 opacity-50" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
                </span>
                <span className="text-zinc-200">Latency</span>
              </div>
              <div className="font-mono text-lg text-white">{latencyMs}ms</div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTarget("scvd.store")}
                className={`h-9 border font-mono text-[11px] uppercase ${
                  target === "scvd.store" ? "border-amber-400 text-amber-300" : "border-zinc-800 text-zinc-400"
                }`}
              >
                scvd.store
              </button>
              <button
                type="button"
                onClick={() => setTarget("custom-agent-proxy")}
                className={`h-9 border font-mono text-[11px] uppercase ${
                  target === "custom-agent-proxy"
                    ? "border-amber-400 text-amber-300"
                    : "border-zinc-800 text-zinc-400"
                }`}
              >
                custom proxy
              </button>
            </div>

            <div className="mt-3 border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Current Request</span>
                <span className="text-amber-300">+{fmtUsd(REQUEST_COST)} USDC</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-zinc-400">Cumulative Spent</span>
                <span className="text-white">{fmtUsd(spent)} USDC</span>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setFaultMode("none")}
                className={`h-8 border font-mono text-[10px] uppercase ${
                  faultMode === "none" ? "border-emerald-400 text-emerald-400" : "border-zinc-800 text-zinc-500"
                }`}
              >
                normal
              </button>
              <button
                type="button"
                onClick={() => setFaultMode("http502")}
                className={`h-8 border font-mono text-[10px] uppercase ${
                  faultMode === "http502" ? "border-rose-500 text-rose-400" : "border-zinc-800 text-zinc-500"
                }`}
              >
                simulate 502
              </button>
              <button
                type="button"
                onClick={() => setFaultMode("truncated")}
                className={`h-8 border font-mono text-[10px] uppercase ${
                  faultMode === "truncated" ? "border-rose-500 text-rose-400" : "border-zinc-800 text-zinc-500"
                }`}
              >
                truncated
              </button>
            </div>

            <button
              type="button"
              onClick={() => void runExecution()}
              disabled={isRunning}
              className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 border border-zinc-700 bg-zinc-950 font-mono text-xs uppercase tracking-[0.16em] text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              <RadioTower className="h-4 w-4" />
              {isRunning ? "Executing…" : "Run x402 / MPP flow"}
            </button>
          </article>
              </section>
            ) : (
              <>
                <section className="mt-5 border border-zinc-800 bg-zinc-900/20 p-4">
                  <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-zinc-400">
                    Settlement vs Fulfillment Visualizer
                  </p>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {[
                      "1) Intercept HTTP 402 Payment Required header",
                      "2) Escrow Hold on-chain (funds held, not settled)",
                      "3) Stream payload + compute SHA-256 artifact hash",
                      "4) Capture on match or Clawback on fault",
                    ].map((step, idx) => {
                      const done = idx < Math.min(stateIndex, coreFlow.length);
                      const isCurrent = idx === Math.min(stateIndex, coreFlow.length - 1);
                      const failed = state === "CLAWBACK_TRIGGERED" && idx >= 2;
                      return (
                        <div
                          key={step}
                          className={`flex items-center gap-2 border px-3 py-2 font-mono text-xs ${
                            failed
                              ? "border-rose-500 text-rose-300"
                              : done
                                ? "border-emerald-400 text-emerald-300"
                                : isCurrent
                                  ? "border-amber-400 text-amber-300"
                                  : "border-zinc-800 text-zinc-500"
                          }`}
                        >
                          {failed ? (
                            <XCircle className="h-4 w-4" />
                          ) : done ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : (
                            <AlertTriangle className="h-4 w-4" />
                          )}
                          <span>{step}</span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 grid gap-2 md:grid-cols-2">
                    <div className="border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs">
                      <div className="text-zinc-400">Expected SHA-256</div>
                      <div className="mt-1 break-all text-zinc-200">{expectedHash}</div>
                    </div>
                    <div className="border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs">
                      <div className="text-zinc-400">Received SHA-256</div>
                      <div className="mt-1 break-all text-zinc-200">{receivedHash}</div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-3 font-mono text-xs">
                    <span className="border border-zinc-800 px-2 py-1 text-zinc-300">target={requestLabel}</span>
                    <span className="border border-zinc-800 px-2 py-1 text-zinc-300">fault={faultMode}</span>
                    <span
                      className={`border px-2 py-1 ${
                        state === "SETTLED_CAPTURED"
                          ? "border-emerald-400 text-emerald-300"
                          : state === "CLAWBACK_TRIGGERED"
                            ? "border-rose-500 text-rose-400"
                            : "border-zinc-800 text-zinc-300"
                      }`}
                    >
                      state={state}
                    </span>
                    {txSig ? (
                      <a
                        href={txLink(txSig)}
                        target="_blank"
                        rel="noreferrer"
                        className="border border-emerald-400 px-2 py-1 text-emerald-400 underline"
                      >
                        Explorer: {txSig.slice(0, 18)}…
                      </a>
                    ) : null}
                  </div>
                </section>

                <section className="mt-5 border border-zinc-800 bg-zinc-900/10">
                  <button
                    type="button"
                    onClick={() => setLogOpen((v) => !v)}
                    className="flex h-10 w-full items-center justify-between px-4 font-mono text-xs uppercase tracking-[0.18em] text-zinc-300 hover:bg-zinc-900/40"
                  >
                    <span>Agent Wire Logs</span>
                    <span>{logOpen ? "Hide" : "Show"}</span>
                  </button>
                  {logOpen ? (
                    <div className="max-h-64 overflow-auto border-t border-zinc-800 bg-zinc-950 p-4 font-mono text-xs">
                      {logs.map((l, i) => (
                        <div key={`${l.at}-${i}`} className="mb-1 flex gap-3">
                          <span className="text-zinc-500">{l.at}</span>
                          <span
                            className={
                              l.level === "OK"
                                ? "text-emerald-400"
                                : l.level === "WARN"
                                  ? "text-amber-400"
                                  : l.level === "ERROR"
                                    ? "text-rose-500"
                                    : "text-zinc-300"
                            }
                          >
                            [{l.level}]
                          </span>
                          <span className="text-zinc-200">{l.line}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
