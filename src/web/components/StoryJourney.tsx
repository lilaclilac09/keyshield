import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch, getToken } from '../lib/auth';
import { detectUpstream } from '../lib/keychain';
import {
  captureMppStream,
  demoMeterStream,
  fetchCapturePrep,
} from '../lib/api';
import { signCaptureMac } from '../lib/mpp-capture';

/** Fixture prefixes only — never a live secret. Long enough for the real detectors. */
export const DEMO_KEYS = {
  openrouter: 'sk-or-v1-DEMOKEYSHIELDLOCALONLYNOTAREALSECRET',
  vercel: 'vercel_DEMOKEYSHIELDLOCALONLY99xx',
  github: 'github_pat_DEMOKEYSHIELDLOCALONLY99',
} as const;

const SCENES = [
  { id: 'scan', title: 'OpenRouter scan' },
  { id: 'fill', title: 'Cursor / Devin fill' },
  { id: 'catalog', title: 'Vercel + GitHub' },
  { id: 'pay', title: 'Devnet buy' },
  { id: 'rpc', title: 'RPC handshake' },
  { id: 'fail', title: 'Failed pay' },
  { id: 'onepass', title: 'vs 1Password' },
  { id: 'mesh', title: 'Agents + x402' },
] as const;

type SceneId = (typeof SCENES)[number]['id'];

type StatusSnap = {
  cached?: boolean;
  rpc_ms?: number;
  sol_lamports?: number;
  usdc_micro?: number;
  stream_remaining_micro_usdc?: number;
  last_receipt?: { hash8?: string; mode?: string; signature?: string; micro_usdc?: number };
};

function mask(value: string): string {
  if (value.length < 12) return '••••';
  return `${value.slice(0, 7)}…${value.slice(-4)}`;
}

async function loadStatus(): Promise<StatusSnap | null> {
  const r = await apiFetch('/mpp/status');
  if (!r.ok) return null;
  return r.json();
}

export const StoryJourney: React.FC = () => {
  const auto = useMemo(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('auto') === '1',
    [],
  );
  const [scene, setScene] = useState<SceneId>('scan');
  const [toast, setToast] = useState(false);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [filled, setFilled] = useState('');
  const [status, setStatus] = useState<StatusSnap | null>(null);
  const [status2, setStatus2] = useState<StatusSnap | null>(null);
  const [buyLog, setBuyLog] = useState('');
  const [buying, setBuying] = useState(false);

  const orDetect = detectUpstream(DEMO_KEYS.openrouter);
  const vercelDetect = detectUpstream(DEMO_KEYS.vercel);
  const githubDetect = detectUpstream(DEMO_KEYS.github);

  const saveKey = useCallback((upstream: string, value: string) => {
    setSaved((prev) => ({ ...prev, [upstream]: value }));
  }, []);

  const runHandshake = useCallback(async () => {
    const first = await loadStatus();
    setStatus(first);
    const second = await loadStatus();
    setStatus2(second);
  }, []);

  const runBuy = useCallback(async () => {
    if (buying) return;
    setBuying(true);
    setBuyLog('listing open streams…');
    try {
      const listed = await apiFetch('/mpp/streams');
      if (!listed.ok) throw new Error(`streams HTTP ${listed.status}`);
      const body = await listed.json();
      const streams = (body.streams || []) as Array<{ id: number; status?: string }>;
      const open = streams.find((s) => s.status === 'open');
      if (!open) throw new Error('no open stream — wallet is funded, open one from Payments first');
      setBuyLog(`hold + record on stream ${open.id}`);
      await demoMeterStream(open.id, 'story-journey ping');
      const prep = await fetchCapturePrep(open.id);
      const token = getToken();
      if (!token) throw new Error('no KS_TOKEN — wallet-login first');
      const mac = await signCaptureMac(token, prep.artifactHash);
      setBuyLog('CAPTURE HMAC → mpp_settle ix 26');
      const cap = await captureMppStream(open.id, prep.artifactHash, mac);
      const after = await loadStatus();
      setStatus(after);
      const receipt = after?.last_receipt;
      setBuyLog(
        `settle_mode=${String((cap as { settle_mode?: string }).settle_mode || receipt?.mode || 'ok')}  hash8=${receipt?.hash8 || '—'}  sig=${receipt?.signature || '—'}`,
      );
    } catch (err) {
      setBuyLog(err instanceof Error ? err.message : 'buy failed');
    } finally {
      setBuying(false);
    }
  }, [buying]);

  useEffect(() => {
    if (scene === 'scan') {
      const t = window.setTimeout(() => setToast(true), 700);
      return () => window.clearTimeout(t);
    }
    setToast(false);
    return undefined;
  }, [scene]);

  useEffect(() => {
    if (scene === 'rpc' || scene === 'pay') {
      void runHandshake();
    }
  }, [scene, runHandshake]);

  useEffect(() => {
    if (!auto) return undefined;
    const order: SceneId[] = SCENES.map((s) => s.id);
    let i = 0;
    const timers: number[] = [];
    const tick = () => {
      const id = order[i];
      setScene(id);
      if (id === 'scan') {
        timers.push(window.setTimeout(() => saveKey('openrouter', DEMO_KEYS.openrouter), 1800));
      }
      if (id === 'fill') {
        timers.push(window.setTimeout(() => setFilled(DEMO_KEYS.openrouter), 1200));
      }
      if (id === 'catalog') {
        saveKey('vercel', DEMO_KEYS.vercel);
        saveKey('github', DEMO_KEYS.github);
      }
      if (id === 'pay') {
        timers.push(window.setTimeout(() => { void runBuy(); }, 1500));
      }
      i += 1;
      if (i < order.length) timers.push(window.setTimeout(tick, id === 'pay' ? 14000 : 8500));
    };
    tick();
    return () => { timers.forEach((id) => window.clearTimeout(id)); };
    // Drive the take once. runBuy/saveKey are stable enough for a single auto pass.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  const idx = SCENES.findIndex((s) => s.id === scene);

  return (
    <div className="min-h-screen bg-[#070b18] text-[#e8ecff]" style={{ fontFamily: "'Montserrat','Inter',sans-serif" }}>
      <header className="flex items-center justify-between px-5 py-3 border-b border-[#1c2550]">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#8a96c2]">KeyShield · coherent journey</div>
          <div className="text-sm font-semibold">Detect → vault → fill → pay → RPC → fault → 1Password → mesh</div>
        </div>
        <a className="text-[11px] text-[#93b4ff]" href="/">Dashboard</a>
      </header>
      <nav className="flex gap-1 px-4 py-2 overflow-x-auto border-b border-[#1c2550]">
        {SCENES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setScene(s.id)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] ${scene === s.id ? 'bg-white text-black' : 'text-[#8a96c2] border border-[#243365]'}`}
          >
            {i + 1} {s.title}
          </button>
        ))}
      </nav>
      <main className="max-w-5xl mx-auto px-5 py-6">
        {scene === 'scan' && (
          <OpenRouterScene
            toast={toast}
            saved={!!saved.openrouter}
            detected={orDetect.matched}
            prefix={orDetect.prefix}
            onSave={() => saveKey('openrouter', DEMO_KEYS.openrouter)}
          />
        )}
        {scene === 'fill' && (
          <FillScene
            filled={filled}
            hasVault={!!saved.openrouter}
            onFill={() => setFilled(saved.openrouter || DEMO_KEYS.openrouter)}
          />
        )}
        {scene === 'catalog' && (
          <CatalogScene
            vercelOk={vercelDetect.matched}
            githubOk={githubDetect.matched}
            vercelPrefix={vercelDetect.prefix}
            githubPrefix={githubDetect.prefix}
            saved={saved}
          />
        )}
        {scene === 'pay' && (
          <PayScene status={status} log={buyLog} busy={buying} onBuy={() => void runBuy()} />
        )}
        {scene === 'rpc' && <RpcScene first={status} second={status2} />}
        {scene === 'fail' && <FailScene />}
        {scene === 'onepass' && <OnePasswordScene />}
        {scene === 'mesh' && <MeshScene />}
      </main>
      <footer className="px-5 pb-6 text-[11px] text-[#5c6a94]">
        Scene {idx + 1}/{SCENES.length}. Demo keys are labeled DEMO and never a live secret.
        Hermes in this repo is Pyth SSE. Agent runtime is OpenClaw + MCP + /vproxy.
      </footer>
    </div>
  );
};

function ChromeFrame({ host, children }: { host: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#243365] bg-[#0b1226] overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-[#10182f] border-b border-[#243365] text-[11px] text-[#8a96c2]">
        <span className="w-2 h-2 rounded-full bg-[#3e4a72]" />
        <span className="font-mono">{host}</span>
        <span className="ml-auto uppercase tracking-wider text-[9px] text-amber-300">local fixture</span>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function OpenRouterScene({
  toast, saved, detected, prefix, onSave,
}: {
  toast: boolean; saved: boolean; detected: boolean; prefix: string | null; onSave: () => void;
}) {
  return (
    <div className="relative">
      <ChromeFrame host="https://openrouter.ai/nvidia/nemotron-3-ultra-550b-a55b:free">
        <div className="text-[10px] uppercase tracking-wider text-[#8a96c2]">Free model</div>
        <h1 className="text-2xl font-bold mt-1">NVIDIA: Nemotron 3 Ultra (free)</h1>
        <p className="mt-2 text-sm text-[#a1a1aa]">nvidia/nemotron-3-ultra-550b-a55b:free</p>
        <div className="mt-5 p-4 rounded-lg bg-[#0e1631] border border-[#243365]">
          <div className="text-[10px] uppercase tracking-wider text-[#8a96c2]">API key on this page</div>
          <code className="block mt-2 font-mono text-sm text-emerald-300">{DEMO_KEYS.openrouter}</code>
          <p className="mt-2 text-[12px] text-[#8a96c2]">
            Extension regex <code>/sk-or-[A-Za-z0-9_-]{'{12,}'}/</code> · detector {detected ? 'matched' : 'missed'} · prefix {prefix}
          </p>
        </div>
      </ChromeFrame>
      {toast && (
        <div className="absolute top-4 right-4 w-80 rounded-xl border border-[#1c2238] bg-[#0a0d1a] p-4 shadow-2xl">
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 rounded bg-[#0e1430] text-[10px] font-bold text-[#5b8cff] border border-[#1c2550]">OR</span>
            <div>
              <div className="text-sm font-semibold">API key detected</div>
              <div className="text-[11px] text-[#a1a1aa]">OpenRouter · {prefix}</div>
            </div>
          </div>
          <button type="button" onClick={onSave} className="mt-3 w-full rounded-lg bg-[#5b8cff] text-white text-sm py-2">
            {saved ? 'Saved to Device Vault' : 'Save to vault'}
          </button>
          <p className="mt-2 text-[10px] text-[#71717a]">Ciphertext / vault id only. Server does not echo the key.</p>
        </div>
      )}
    </div>
  );
}

function FillScene({ filled, hasVault, onFill }: { filled: string; hasVault: boolean; onFill: () => void }) {
  return (
    <ChromeFrame host="cursor / devin · settings · models">
      <h1 className="text-xl font-bold">OpenAI-compatible API key</h1>
      <p className="text-sm text-[#a1a1aa] mt-1">Any runner that wants a key: Cursor, Devin, OpenClaw, Hermes-shaped agents.</p>
      <label className="block mt-6 text-[10px] uppercase tracking-wider text-[#8a96c2]">API Key</label>
      <div className="relative mt-1">
        <input
          readOnly
          value={filled ? mask(filled) : ''}
          placeholder="sk-… paste or let KeyShield fill"
          className="w-full bg-[#0e1631] border border-[#243365] rounded-lg px-3 py-3 font-mono text-sm"
        />
        <button type="button" onClick={onFill} className="absolute right-2 top-2 px-2 py-1 rounded bg-[#0a0d1a] border border-[#1c2550] text-[#5b8cff] text-xs">
          🔑 Fill
        </button>
      </div>
      <p className="mt-3 text-[12px] text-[#8a96c2]">
        {hasVault ? 'Vault has the OpenRouter row. Fill injects locally — no clipboard.' : 'Save the OpenRouter key first (scene 1).'}
      </p>
      <p className="mt-2 text-[12px] text-emerald-300">{filled ? `Filled ${mask(filled)} · agent still holds KS_TOKEN, not this secret` : 'Waiting for fill…'}</p>
    </ChromeFrame>
  );
}

function CatalogScene({
  vercelOk, githubOk, vercelPrefix, githubPrefix, saved,
}: {
  vercelOk: boolean; githubOk: boolean; vercelPrefix: string | null; githubPrefix: string | null;
  saved: Record<string, string>;
}) {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <ChromeFrame host="vercel.com / account / tokens">
        <h2 className="font-bold">Vercel token</h2>
        <code className="block mt-3 font-mono text-xs text-emerald-300 break-all">{DEMO_KEYS.vercel}</code>
        <p className="mt-2 text-[12px] text-[#8a96c2]">{vercelOk ? `detected ${vercelPrefix}` : 'detector miss'}</p>
        <p className="mt-1 text-[11px] text-[#5c6a94]">{saved.vercel ? 'in vault' : 'same Save toast as OpenRouter'}</p>
      </ChromeFrame>
      <ChromeFrame host="github.com / settings / tokens">
        <h2 className="font-bold">GitHub PAT</h2>
        <code className="block mt-3 font-mono text-xs text-emerald-300 break-all">{DEMO_KEYS.github}</code>
        <p className="mt-2 text-[12px] text-[#8a96c2]">{githubOk ? `detected ${githubPrefix}` : 'detector miss'}</p>
        <p className="mt-1 text-[11px] text-[#5c6a94]">{saved.github ? 'in vault' : 'ghp_ / github_pat_ prefixes'}</p>
      </ChromeFrame>
      <div className="md:col-span-2 text-[12px] text-[#8a96c2]">
        One vault, many upstreams: OpenRouter, OpenAI, Anthropic, Groq, Helius, Vercel, GitHub, 0x, Alchemy.
        Proxy injects once per call. This is the “universal API key” beat — not a password manager clone.
      </div>
    </div>
  );
}

function PayScene({
  status, log, busy, onBuy,
}: {
  status: StatusSnap | null; log: string; busy: boolean; onBuy: () => void;
}) {
  const sol = status?.sol_lamports != null ? (status.sol_lamports / 1e9).toFixed(3) : '—';
  const usdc = status?.usdc_micro != null ? (status.usdc_micro / 1e6).toFixed(6) : '—';
  const rec = status?.last_receipt;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 text-[11px] font-mono px-3 py-2 rounded-lg border border-[#243365] bg-[#0e1631]">
        <span>DEVNET</span>
        <span>{status?.cached ? 'CACHE' : 'HANDSHAKE'}</span>
        <span>SOL {sol}</span>
        <span>USDC {usdc}</span>
        <span>STREAM {status?.stream_remaining_micro_usdc ?? '—'}</span>
        <span>RECEIPT {rec?.hash8 ?? '—'}</span>
        <span>{rec?.mode ?? ''}</span>
      </div>
      <ChromeFrame host="payable API · top up already on the funded owner · 1 µUSDC">
        <h1 className="text-xl font-bold">Buy — Hold · Verify · Capture</h1>
        <p className="text-sm text-[#a1a1aa] mt-2">Owner USDC stays on the wallet. Micro leaves the stream ATA. Not a shop mock.</p>
        <button
          type="button"
          onClick={onBuy}
          disabled={busy}
          className="mt-4 px-4 py-2 rounded-lg bg-white text-black text-sm font-semibold disabled:opacity-50"
        >
          {busy ? 'Settling…' : 'Capture 1 micro-USDC'}
        </button>
        <pre className="mt-4 text-[12px] font-mono whitespace-pre-wrap text-emerald-300">{log || 'Press capture when the stream is open.'}</pre>
        {rec?.signature && (
          <a className="text-[12px] text-[#93b4ff] break-all" href={`https://explorer.solana.com/tx/${rec.signature}?cluster=devnet`} target="_blank" rel="noreferrer">
            explorer {rec.signature}
          </a>
        )}
      </ChromeFrame>
    </div>
  );
}

function RpcScene({ first, second }: { first: StatusSnap | null; second: StatusSnap | null }) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">RPC flash — server handshake, not the browser</h1>
      <p className="text-sm text-[#a1a1aa]">GET /mpp/status → one getMultipleAccounts. Browser never talks to api.devnet.solana.com. redb is not open.</p>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="p-5 rounded-xl border border-[#243365] bg-[#0e1631]">
          <div className="text-[10px] uppercase text-[#8a96c2]">Handshake</div>
          <div className="text-3xl font-bold mt-2">{first?.rpc_ms ?? '—'} ms</div>
          <div className="text-[12px] mt-1">cached={String(first?.cached)}</div>
        </div>
        <div className="p-5 rounded-xl border border-emerald-900 bg-[#0e1631]">
          <div className="text-[10px] uppercase text-emerald-400">Memory cache</div>
          <div className="text-3xl font-bold mt-2 text-emerald-300">{second?.rpc_ms ?? '—'} ms</div>
          <div className="text-[12px] mt-1">cached={String(second?.cached)}</div>
        </div>
      </div>
    </div>
  );
}

function FailScene() {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="p-5 rounded-xl border border-red-900 bg-[#1a0e12]">
        <div className="text-[10px] uppercase text-red-300">Naive · labeled MOCK</div>
        <h2 className="font-bold mt-1">.env + HTTP 502</h2>
        <p className="text-sm text-[#c4b5b5] mt-2">Harness <code>fault_502</code> is a local mock, not a live shop. Debit can orphan if you settle before the body exists.</p>
      </div>
      <div className="p-5 rounded-xl border border-emerald-900 bg-[#0e1612]">
        <div className="text-[10px] uppercase text-emerald-300">KeyShield</div>
        <h2 className="font-bold mt-1">Hash fail → no CAPTURE</h2>
        <p className="text-sm text-[#a1a1aa] mt-2">Hold, record artifact, HMAC, then mpp_settle. Wrong hash: settled does not move. Unilateral clawback stays on the stream.</p>
      </div>
    </div>
  );
}

function OnePasswordScene() {
  const rows = [
    ['Detect sk-or- / vercel_ / github_pat_ on the page', 'No', 'Yes — content script'],
    ['Fill Cursor / Devin API fields', 'op inject / env', 'One-click fill, no clipboard'],
    ['Agent holds the raw upstream key', 'Often yes', 'No — KS_TOKEN + /vproxy'],
    ['Per-call USDC + x402 402', 'No', 'Yes'],
    ['On-chain settle / hash-fail clawback', 'No', 'mpp_settle ix 26'],
    ['RPC handshake cache for the strip', 'No', '20s memory, not redb'],
  ];
  return (
    <div>
      <h1 className="text-xl font-bold">Better than 1Password CLI for this job — not a password clone</h1>
      <p className="text-sm text-[#a1a1aa] mt-2">1Password is strong at human passwords. KeyShield is the developer-key + agent + micropay path.</p>
      <table className="w-full mt-4 text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase text-[#8a96c2]">
            <th className="py-2">Job</th>
            <th>1Password CLI</th>
            <th>KeyShield</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]} className="border-t border-[#243365]">
              <td className="py-2 pr-3">{r[0]}</td>
              <td className="pr-3 text-[#a1a1aa]">{r[1]}</td>
              <td className="text-emerald-300">{r[2]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MeshScene() {
  const nodes = [
    ['OpenClaw + MCP', 'Unix-socket KS_TOKEN. Zero paste.'],
    ['/vproxy/openrouter', 'OpenAI-compatible. Nemotron free model id.'],
    ['x402', 'Extension intercepts 402 + X-Payment-Required.'],
    ['Pyth Hermes', 'Price SSE in this repo — not an LLM runner.'],
    ['MPP / HVC', 'Hold → artifact → capture → ix 26.'],
    ['Cursor / Devin', 'Same fill + session. No .env.'],
  ];
  return (
    <div>
      <h1 className="text-xl font-bold">All wired — one vault, many runners</h1>
      <div className="grid md:grid-cols-3 gap-3 mt-4">
        {nodes.map((n) => (
          <div key={n[0]} className="p-4 rounded-xl border border-[#243365] bg-[#0e1631]">
            <div className="font-semibold">{n[0]}</div>
            <div className="text-[12px] text-[#a1a1aa] mt-1">{n[1]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
