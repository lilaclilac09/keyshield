import React, { useState, useEffect, useCallback } from 'react';
import {
  Bot, Plus, Trash2, RefreshCw, Loader2, AlertCircle, Check, Zap,
} from 'lucide-react';
import { apiFetch } from '../../lib/auth';
import { relTime } from '../../lib/time';
import { CopyButton } from '../ui/CopyButton';
import { ConfirmButton } from '../ui/ConfirmButton';

interface AgentEntry {
  id:           number;
  pubkey_b58:   string;
  name:         string;
  scopes:       string;
  created_at:   number;
  last_used_at: number | null;
}

const _b58Encode = (bytes: Uint8Array): string => {
  const ALPHA = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n = BigInt('0x' + Array.from(bytes).map(b => b.toString(16).padStart(2,'0')).join(''));
  let res = '';
  while (n > 0n) { const r = Number(n % 58n); n /= 58n; res = ALPHA[r] + res; }
  const pad = bytes.findIndex(b => b !== 0);
  return '1'.repeat(pad < 0 ? 0 : pad) + res;
};

export const AgentsSection: React.FC = () => {
  const [agentList,    setAgentList]    = useState<AgentEntry[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [newName,      setNewName]      = useState('');
  const [newPubkey,    setNewPubkey]    = useState('');
  const [newScopes,    setNewScopes]    = useState('*');
  const [generatedKp,  setGeneratedKp]  = useState<{privateKeyHex: string; pubkeyB58: string} | null>(null);
  const [registering,  setRegistering]  = useState(false);
  const [revokingId,   setRevokingId]   = useState<number | null>(null);
  const [err,          setErr]          = useState('');
  const [ok,           setOk]           = useState('');

  const load = useCallback(async () => {
    try {
      const r = await apiFetch('/agents/list');
      if (r.ok) { const d = await r.json(); setAgentList(d.agents ?? []); }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const generateKeypair = async () => {
    const kp = await window.crypto.subtle.generateKey(
      { name: 'Ed25519' },
      true,
      ['sign', 'verify'],
    );
    const privRaw = await window.crypto.subtle.exportKey('pkcs8', kp.privateKey);
    const pubRaw  = await window.crypto.subtle.exportKey('raw',   kp.publicKey);

    const privBytes = new Uint8Array(privRaw).slice(-32);
    const pubBytes  = new Uint8Array(pubRaw);

    const privHex   = Array.from(privBytes).map(b => b.toString(16).padStart(2,'0')).join('');
    const pubB58    = _b58Encode(pubBytes);

    setGeneratedKp({ privateKeyHex: privHex, pubkeyB58: pubB58 });
    setNewPubkey(pubB58);
  };

  const handleRegister = async () => {
    if (!newPubkey.trim() || !newName.trim()) return;
    setRegistering(true); setErr(''); setOk('');
    try {
      const r = await apiFetch('/agents/register', {
        method: 'POST',
        body: JSON.stringify({ pubkeyB58: newPubkey.trim(), name: newName.trim(), scopes: newScopes }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.detail ?? 'Failed'); return; }
      setOk(`Agent "${d.name}" registered`);
      setNewName(''); setNewPubkey(''); setNewScopes('*');
      load();
    } catch { setErr('Network error'); }
    finally { setRegistering(false); }
  };

  const handleRevoke = async (id: number) => {
    setRevokingId(id);
    try {
      await apiFetch(`/agents/${id}`, { method: 'DELETE' });
      setAgentList(prev => prev.filter(a => a.id !== id));
    } catch { /* ignore */ }
    finally { setRevokingId(null); }
  };

  return (
    <div className="space-y-5">
      {/* How it works */}
      <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 p-5">
        <h3 className="text-[14px] font-medium text-white mb-2 flex items-center gap-2">
          <Bot size={14} className="text-[#5b8cff]" /> Agent authentication
        </h3>
        <p className="text-[12px] text-zinc-400 mb-4">
          Agents authenticate with their own ed25519 keypair — no browser, no wallet extension, no human.
          Register the agent's public key here once. The agent signs a server challenge on each run and
          gets a vault token linked to your wallet.
        </p>
        <div className="grid grid-cols-3 gap-3">
          {[
            { step: '1', title: 'Generate keypair', body: 'Agent generates an ed25519 key. Private key stays in env vars — never committed.' },
            { step: '2', title: 'Register pubkey', body: 'Owner registers the public key here. One-time setup, takes 5 seconds.' },
            { step: '3', title: 'Agent self-authenticates', body: 'On each run, agent calls /auth/agent-login, signs a nonce, gets a vault token.' },
          ].map(({ step, title, body }) => (
            <div key={step} className="rounded-xl border border-[#1c2238] bg-[#070912] p-3">
              <div className="text-[10px] text-[#5b8cff] font-mono mb-1">Step {step}</div>
              <div className="text-[12px] text-white font-medium mb-1">{title}</div>
              <div className="text-[11px] text-zinc-500">{body}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Registered agents */}
      <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#141a2e] flex items-center justify-between">
          <h3 className="text-[13px] font-medium text-white">Registered agents</h3>
          <button onClick={load} className="text-zinc-500 hover:text-white transition-colors">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {agentList.length === 0 && !loading && (
          <div className="py-8 text-center">
            <p className="text-[13px] text-zinc-500">No agents registered yet</p>
            <p className="text-[11px] text-zinc-700 mt-1">Generate a keypair below and register your first agent</p>
          </div>
        )}

        {agentList.map(a => (
          <div key={a.id} className="flex items-center gap-4 px-5 py-3.5 border-b border-[#0d1020] last:border-0">
            <div className="w-8 h-8 rounded-lg bg-[#0e1430] border border-[#1c2550] flex items-center justify-center shrink-0">
              <Bot size={14} className="text-[#5b8cff]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-white font-medium">{a.name}</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded border border-[#1c2238] text-zinc-500 font-mono">
                  {a.scopes}
                </span>
                {a.last_used_at && <span className="text-[9px] text-emerald-600">● active</span>}
              </div>
              <div className="text-[11px] text-zinc-600 font-mono mt-0.5">
                {a.pubkey_b58.slice(0, 16)}…{a.pubkey_b58.slice(-8)}
              </div>
              <div className="text-[10px] text-zinc-700 mt-0.5 flex gap-3">
                <span>registered {relTime(a.created_at)}</span>
                {a.last_used_at && <span>last seen {relTime(a.last_used_at)}</span>}
              </div>
            </div>
            <ConfirmButton
              variant="destructive"
              onConfirm={() => handleRevoke(a.id)}
              disabled={revokingId === a.id}
              title="Revoke agent (click twice). Cascades to active tokens."
              confirmLabel="Confirm revoke"
              className="h-7 px-2 rounded-md text-[11px] flex items-center gap-1"
            >
              {revokingId === a.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              <span>Revoke</span>
            </ConfirmButton>
          </div>
        ))}
      </div>

      {/* Register new agent */}
      <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 p-5 space-y-4">
        <h3 className="text-[13px] font-medium text-white">Register a new agent</h3>

        {err && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-950/30 border border-rose-900/50">
            <AlertCircle size={13} className="text-rose-400 shrink-0" />
            <p className="text-[12px] text-rose-300">{err}</p>
          </div>
        )}
        {ok && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-950/30 border border-emerald-900/50">
            <Check size={13} className="text-emerald-400 shrink-0" />
            <p className="text-[12px] text-emerald-300">{ok}</p>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-zinc-500 uppercase tracking-wider">Step 1 — generate keypair</span>
            <button
              onClick={generateKeypair}
              className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border border-[#1c2550] bg-[#0e1430] text-[#5b8cff] hover:bg-[#141c40] transition-colors"
            >
              <Zap size={11} /> Generate
            </button>
          </div>

          {generatedKp && (
            <div className="rounded-lg border border-amber-900/40 bg-amber-950/10 p-3 space-y-2">
              <div className="flex items-center gap-2 text-[10px] text-amber-400">
                <AlertCircle size={11} />
                Save the private key NOW — it won't be shown again
              </div>
              <div className="space-y-1.5">
                <div>
                  <div className="text-[10px] text-zinc-600 mb-1">Private key (KS_AGENT_KEY env var)</div>
                  <div className="flex items-center gap-2 px-2.5 py-2 rounded bg-[#020408] border border-[#131929]">
                    <code className="flex-1 text-[11px] font-mono text-rose-300 break-all">{generatedKp.privateKeyHex}</code>
                    <CopyButton text={generatedKp.privateKeyHex} />
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-zinc-600 mb-1">Public key (paste below)</div>
                  <div className="flex items-center gap-2 px-2.5 py-2 rounded bg-[#020408] border border-[#131929]">
                    <code className="flex-1 text-[11px] font-mono text-emerald-300 break-all">{generatedKp.pubkeyB58}</code>
                    <CopyButton text={generatedKp.pubkeyB58} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <span className="text-[11px] text-zinc-500 uppercase tracking-wider">Step 2 — register</span>
          <input
            type="text"
            placeholder="Agent name (e.g. trading-bot-v1)"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="w-full bg-[#070912] border border-[#1c2238] rounded-lg px-3 py-2 text-[13px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#5b8cff]/50"
          />
          <input
            type="text"
            placeholder="Agent public key (base58)"
            value={newPubkey}
            onChange={e => setNewPubkey(e.target.value)}
            className="w-full bg-[#070912] border border-[#1c2238] rounded-lg px-3 py-2 text-[13px] font-mono text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#5b8cff]/50"
          />
          <div className="flex items-center gap-2">
            <select
              value={newScopes}
              onChange={e => setNewScopes(e.target.value)}
              className="flex-1 bg-[#070912] border border-[#1c2238] rounded-lg px-3 py-2 text-[13px] text-white focus:outline-none focus:border-[#5b8cff]/50"
            >
              <option value="*">All scopes (*)</option>
              <option value="proxy">Proxy only</option>
              <option value="proxy,read">Proxy + read vault</option>
            </select>
            <button
              onClick={handleRegister}
              disabled={registering || !newName.trim() || !newPubkey.trim()}
              className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[#5b8cff] hover:bg-[#7aa1ff] disabled:bg-[#1c2238] disabled:text-zinc-500 text-white text-[13px] font-medium transition-colors"
            >
              {registering ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              Register
            </button>
          </div>
        </div>

        <div className="space-y-1.5 pt-1">
          <span className="text-[11px] text-zinc-500 uppercase tracking-wider">Step 3 — agent code</span>
          <div className="rounded-lg bg-[#020408] border border-[#131929] p-3.5 relative">
            <CopyButton
              text={`from keyshield_sdk import AgentKeyShield\nimport os\n\nagent = AgentKeyShield(\n    owner_wallet     = os.getenv("KS_OWNER_WALLET"),\n    private_key_hex  = os.getenv("KS_AGENT_KEY"),\n    vault_passphrase = os.getenv("KS_VAULT_PASS"),\n)\n\n# authenticate is automatic on first call\nclient = agent.openai_client()\nresp = client.chat.completions.create(\n    model="gpt-4o-mini",\n    messages=[{"role": "user", "content": "analyze market"}],\n)\nprint(resp.choices[0].message.content)`}
              className="absolute top-2.5 right-2.5"
            />
            <pre className="text-[11px] font-mono text-zinc-300 leading-relaxed overflow-x-auto pr-14">{
`from keyshield_sdk import AgentKeyShield
import os

agent = AgentKeyShield(
    owner_wallet     = os.getenv("KS_OWNER_WALLET"),
    private_key_hex  = os.getenv("KS_AGENT_KEY"),
    vault_passphrase = os.getenv("KS_VAULT_PASS"),
)

# authenticate is automatic on first call
client = agent.openai_client()
resp = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "analyze market"}],
)
print(resp.choices[0].message.content)`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
