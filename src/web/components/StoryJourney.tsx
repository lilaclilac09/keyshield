import React, { useCallback, useState } from 'react';
import { apiFetch, getToken } from '../lib/auth';
import { detectUpstream } from '../lib/keychain';
import { captureMppStream } from '../lib/api';
import { signCaptureMac } from '../lib/mpp-capture';

/** Fixture prefixes only — never a live secret. Long enough for the real detectors. */
export const DEMO_KEYS = {
  openrouter: 'sk-or-v1-DEMOKEYSHIELDLOCALONLYNOTAREALSECRET',
  vercel: 'vercel_DEMOKEYSHIELDLOCALONLY99xx',
  github: 'github_pat_DEMOKEYSHIELDLOCALONLY99',
} as const;

const RUNNERS = [
  { id: 'openclaw', label: 'OpenClaw', dest: 'POST /vproxy/openrouter', how: 'Unix-socket KS_TOKEN. No clipboard.', ink: '#5b8cff' },
  { id: 'cursor', label: 'Cursor', dest: 'Settings → Models → API key', how: 'Fill the empty field. Agent keeps KS_TOKEN.', ink: '#c084fc' },
  { id: 'devin', label: 'Devin', dest: 'Secrets → OpenAI-compatible key', how: 'Same vault row, different runner.', ink: '#fbbf24' },
] as const;

type RunnerId = (typeof RUNNERS)[number]['id'];

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

export const StoryJourney: React.FC = () => {
  const [runner, setRunner] = useState<RunnerId>('openclaw');
  const [saved, setSaved] = useState(false);
  const [filled, setFilled] = useState<Record<string, string>>({});
  const [log, setLog] = useState<string[]>(['Click Save, switch an agent, then Fill. Nothing auto-plays.']);
  const [status, setStatus] = useState<StatusSnap | null>(null);
  const [buyLog, setBuyLog] = useState('');
  const [buying, setBuying] = useState(false);

  const or = detectUpstream(DEMO_KEYS.openrouter);
  const vercel = detectUpstream(DEMO_KEYS.vercel);
  const github = detectUpstream(DEMO_KEYS.github);
  const active = RUNNERS.find((r) => r.id === runner) ?? RUNNERS[0];

  const note = useCallback((line: string) => {
    setLog((prev) => [...prev.slice(-10), line]);
  }, []);

  const saveKey = () => {
    setSaved(true);
    note(`clicked Save · ${or.prefix} → Device Vault (ciphertext / vault id)`);
  };

  const switchRunner = (id: RunnerId) => {
    setRunner(id);
    const next = RUNNERS.find((r) => r.id === id);
    note(`switched agent → ${next?.label} · ${next?.dest}`);
  };

  const fillActive = () => {
    if (!saved) {
      note('Fill blocked — Save the OpenRouter key first');
      return;
    }
    setFilled((prev) => ({ ...prev, [runner]: DEMO_KEYS.openrouter }));
    note(`clicked Fill · injected into ${active.label} · runner still holds KS_TOKEN`);
  };

  const handshake = async () => {
    note('clicked Handshake · GET /mpp/status');
    const a = await apiFetch('/mpp/status');
    const first = a.ok ? await a.json() : null;
    const b = await apiFetch('/mpp/status');
    const second = b.ok ? await b.json() : null;
    setStatus(second || first);
    note(`handshake cached=${first?.cached} ${first?.rpc_ms}ms → cache cached=${second?.cached} ${second?.rpc_ms}ms`);
  };

  const runBuy = async () => {
    if (buying) return;
    setBuying(true);
    setBuyLog('clicked Capture…');
    note(`clicked Capture · active agent ${active.label}`);
    try {
      const listed = await apiFetch('/mpp/streams');
      if (!listed.ok) throw new Error(`streams HTTP ${listed.status}`);
      const body = await listed.json();
      const streams = (body.streams || []) as Array<{ id: number; status?: string; upstream?: string }>;
      const open = streams.find((s) => s.status === 'open');
      if (!open) throw new Error('no open stream');
      const token = getToken();
      if (!token) throw new Error('no KS_TOKEN — seed /story-seed.html#token first');
      const upstream = open.upstream || 'anthropic';
      const hold = await apiFetch(`/mpp/streams/${open.id}/hold`, {
        method: 'POST',
        body: JSON.stringify({ estimateMicroUsdc: 1, upstream }),
      });
      if (!hold.ok && hold.status !== 409) {
        const err = await hold.json().catch(() => ({ detail: `hold HTTP ${hold.status}` }));
        throw new Error((err as { detail?: string }).detail || `hold HTTP ${hold.status}`);
      }
      const recorded = await apiFetch(`/mpp/streams/${open.id}/record`, {
        method: 'POST',
        body: JSON.stringify({
          calls: 1,
          tokens: 1,
          status_code: 200,
          body: {
            id: `chatcmpl-click-${Date.now()}`,
            choices: [{ message: { role: 'assistant', content: active.label } }],
            usage: { prompt_tokens: 1, completion_tokens: 0, total_tokens: 1 },
          },
        }),
      });
      if (!recorded.ok) throw new Error(`record HTTP ${recorded.status}`);
      const recBody = await recorded.json() as { stream?: { artifact_hash?: string }; artifact_hash?: string };
      const artifact = recBody.stream?.artifact_hash || recBody.artifact_hash;
      if (!artifact) throw new Error('no artifact_hash');
      const mac = await signCaptureMac(token, artifact);
      const cap = await captureMppStream(open.id, artifact, mac);
      const after = await apiFetch('/mpp/status');
      const snap = after.ok ? await after.json() : null;
      setStatus(snap);
      const receipt = snap?.last_receipt;
      const line = `settle_mode=${String((cap as { settle_mode?: string }).settle_mode || receipt?.mode)}  hash8=${receipt?.hash8 || '—'}  agent=${active.label}`;
      setBuyLog(line);
      note(line);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'buy failed';
      setBuyLog(msg);
      note(msg);
    } finally {
      setBuying(false);
    }
  };

  const filledNow = filled[runner] || '';
  const sol = status?.sol_lamports != null ? (status.sol_lamports / 1e9).toFixed(3) : '—';
  const usdc = status?.usdc_micro != null ? (status.usdc_micro / 1e6).toFixed(6) : '—';

  return (
    <div className="min-h-screen bg-[#070b18] text-[#e8ecff]" style={{ fontFamily: "'Montserrat','Inter',sans-serif" }}>
      <header className="px-5 py-3 border-b border-[#1c2550] flex items-center justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-[#8a96c2]">KeyShield · live desk</div>
          <div className="text-sm font-semibold">Click everything. Switch the agent. Watch the field change.</div>
        </div>
        <div className="flex items-center gap-3">
          <div
            data-ks="active-agent"
            className="px-4 py-2 rounded-lg text-black text-sm font-bold uppercase tracking-wider"
            style={{ background: active.ink }}
          >
            Using {active.label}
          </div>
          <a data-ks="go-dashboard" className="text-[11px] text-[#93b4ff]" href="/">Dashboard</a>
        </div>
      </header>

      <section className="px-5 py-4 border-b border-[#1c2550]">
        <div className="text-[10px] uppercase tracking-wider text-[#8a96c2] mb-2">Active agent — click to switch</div>
        <div className="grid grid-cols-3 gap-3">
          {RUNNERS.map((r) => (
            <button
              key={r.id}
              type="button"
              data-ks={`agent-${r.id}`}
              onClick={() => switchRunner(r.id)}
              className={`text-left rounded-xl border px-4 py-3 transition-colors ${
                runner === r.id ? 'text-black border-transparent' : 'border-[#243365] bg-[#0e1631] hover:border-[#5b8cff]'
              }`}
              style={runner === r.id ? { background: r.ink } : undefined}
            >
              <div className="text-sm font-bold">{r.label}{runner === r.id ? ' · using' : ''}</div>
              <div className={`text-[11px] mt-1 ${runner === r.id ? 'text-black/60' : 'text-[#8a96c2]'}`}>{r.dest}</div>
            </button>
          ))}
        </div>
      </section>

      <main className="grid lg:grid-cols-2 gap-4 px-5 py-5">
        <div className="rounded-xl border border-[#243365] bg-[#0b1226] overflow-hidden">
          <div className="px-3 py-2 bg-[#10182f] border-b border-[#243365] text-[11px] text-[#8a96c2] font-mono">
            openrouter.ai / nvidia/nemotron-3-ultra-550b-a55b:free
            <span className="ml-2 text-amber-300 uppercase">local fixture</span>
          </div>
          <div className="p-5">
            <div className="text-[10px] uppercase text-[#8a96c2]">Free model · key in the DOM</div>
            <h1 className="text-xl font-bold mt-1">Nemotron 3 Ultra (free)</h1>
            <code className="block mt-3 p-3 rounded-lg bg-[#0e1631] border border-[#243365] font-mono text-xs text-emerald-300 break-all">
              {DEMO_KEYS.openrouter}
            </code>
            <p className="mt-2 text-[12px] text-[#8a96c2]">detector {or.matched ? 'matched' : 'missed'} · {or.prefix}</p>
            <button
              type="button"
              data-ks="save-or"
              onClick={saveKey}
              className="mt-4 w-full rounded-lg bg-[#5b8cff] text-white text-sm py-2.5 font-semibold"
            >
              {saved ? 'Saved to Device Vault' : 'Save to vault'}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-[#243365] bg-[#0b1226] overflow-hidden">
          <div className="px-3 py-2 bg-[#10182f] border-b border-[#243365] text-[11px] text-[#8a96c2] font-mono">
            {active.label} · {active.dest}
          </div>
          <div className="p-5">
            <div className="text-[10px] uppercase text-[#8a96c2]">This runner needs an API key</div>
            <h2 className="text-xl font-bold mt-1">{active.label} secret field</h2>
            <p className="text-[12px] text-[#a1a1aa] mt-1">{active.how}</p>
            <label className="block mt-4 text-[10px] uppercase text-[#8a96c2]">API Key</label>
            <div className="relative mt-1">
              <input
                readOnly
                data-ks="key-field"
                value={filledNow ? mask(filledNow) : ''}
                placeholder={runner === 'openclaw' ? 'empty until Fill — then KS_TOKEN is what the agent holds' : 'empty — click Fill'}
                className="w-full bg-[#0e1631] border border-[#243365] rounded-lg px-3 py-3 font-mono text-sm"
              />
              <button
                type="button"
                data-ks="fill"
                onClick={fillActive}
                className="absolute right-2 top-2 px-3 py-1 rounded bg-[#0a0d1a] border border-[#1c2550] text-[#5b8cff] text-xs font-semibold"
              >
                Fill
              </button>
            </div>
            <p className="mt-3 text-[12px] text-emerald-300">
              {filledNow ? `Filled for ${active.label}` : `No value in ${active.label} yet`}
            </p>
            <p className="mt-1 text-[11px] text-[#8a96c2]">Switch agent above — the field is per runner. Same vault row.</p>
          </div>
        </div>
      </main>

      <section className="px-5 pb-4 grid md:grid-cols-3 gap-3">
        <div className="rounded-xl border border-[#243365] bg-[#0e1631] p-4">
          <div className="text-[10px] uppercase text-[#8a96c2]">Vercel / GitHub (same detectors)</div>
          <p className="text-[12px] mt-2 font-mono text-emerald-300">{vercel.prefix}</p>
          <p className="text-[12px] font-mono text-emerald-300">{github.prefix}</p>
        </div>
        <div className="rounded-xl border border-[#243365] bg-[#0e1631] p-4">
          <div className="text-[10px] uppercase text-[#8a96c2]">RPC / wallet</div>
          <p className="text-[12px] mt-2">SOL {sol} · USDC {usdc} · {status?.cached ? 'CACHE' : 'HANDSHAKE'} {status?.rpc_ms ?? '—'}ms</p>
          <button type="button" data-ks="handshake" onClick={() => void handshake()} className="mt-3 px-3 py-1.5 rounded bg-white text-black text-xs font-semibold">
            Handshake
          </button>
        </div>
        <div className="rounded-xl border border-[#243365] bg-[#0e1631] p-4">
          <div className="text-[10px] uppercase text-[#8a96c2]">Devnet 1 µ · agent {active.label}</div>
          <button
            type="button"
            data-ks="capture"
            onClick={() => void runBuy()}
            disabled={buying}
            className="mt-3 w-full px-3 py-2 rounded bg-white text-black text-sm font-semibold disabled:opacity-50"
          >
            {buying ? 'Settling…' : 'Capture 1 µUSDC'}
          </button>
          <p className="mt-2 text-[11px] font-mono text-emerald-300 break-all">{buyLog}</p>
        </div>
      </section>

      <section className="px-5 pb-6 grid md:grid-cols-2 gap-3">
        <div className="rounded-xl border border-[#243365] bg-[#0a0d1a] p-4 min-h-[140px]">
          <div className="text-[10px] uppercase text-[#8a96c2] mb-2">Click log</div>
          {log.map((line, i) => (
            <div key={`${i}-${line}`} className="text-[12px] font-mono text-emerald-300">{line}</div>
          ))}
        </div>
        <div className="rounded-xl border border-[#243365] bg-[#0e1631] p-4 text-[12px] text-[#a1a1aa] space-y-2">
          <p><span className="text-red-300">Naive 502</span> (labeled mock) can orphan a debit. Hash-fail here does not CAPTURE.</p>
          <p>1Password CLI stores/injects secrets. This desk detects, fills without clipboard, proxies, and settles on Devnet.</p>
          <p>Hermes in this repo is Pyth SSE. The switcher is OpenClaw / Cursor / Devin.</p>
        </div>
      </section>
    </div>
  );
};
