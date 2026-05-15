import React, { useState, useEffect, useCallback } from 'react';
import { Bot, Copy, Check, RefreshCw, AlertCircle, AlertTriangle } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { apiFetch } from '../../lib/auth';

interface AgentEntry { id: number; pubkey_b58: string; name: string; scopes: string; created_at: number; last_used_at: number | null; }

const _b58Encode = (bytes: Uint8Array): string => { const ALPHA = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'; let n = BigInt('0x' + Array.from(bytes).map(b => b.toString(16).padStart(2,'0')).join('')); let res = ''; while (n > 0n) { const r = Number(n % 58n); n /= 58n; res = ALPHA[r] + res; } const pad = bytes.findIndex(b => b !== 0); return '1'.repeat(pad < 0 ? 0 : pad) + res; };

const _toB64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); };
  return (
    <button onClick={copy} className="ml-2 text-[#8a96c2] hover:text-white transition-colors shrink-0">
      {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
    </button>
  );
}

export const AgentsSection: React.FC = () => {
  const [agentList, setAgentList] = useState<AgentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newPubkey, setNewPubkey] = useState('');
  const [newPrivkey, setNewPrivkey] = useState(''); // base64 seed — shown once after generation
  const [registering, setRegistering] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const load = useCallback(async () => { try { const r = await apiFetch('/agents/list'); if (r.ok) { const d = await r.json(); setAgentList(d.agents ?? []); } } catch {} finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);

  // Generate keypair and register in one click
  const handleGenerateAndRegister = async () => {
    if (!newName.trim()) { setErr('Enter an agent name first'); return; }
    setRegistering(true); setErr(''); setOk(''); setNewPrivkey('');
    try {
      const kp = await window.crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
      const pkcs8 = new Uint8Array(await window.crypto.subtle.exportKey('pkcs8', kp.privateKey));
      const pubRaw = new Uint8Array(await window.crypto.subtle.exportKey('raw', kp.publicKey));
      // PKCS8 Ed25519: last 32 bytes are the raw seed
      const seed = pkcs8.slice(pkcs8.length - 32);
      const pubB58 = _b58Encode(pubRaw);
      const r = await apiFetch('/agents/register', { method: 'POST', body: JSON.stringify({ pubkeyB58: pubB58, name: newName.trim(), scopes: '*' }) });
      const d = await r.json();
      if (!r.ok) { setErr(d.detail ?? 'Registration failed'); return; }
      setNewPubkey(pubB58);
      setNewPrivkey(_toB64(seed)); // show once so user can save it
      setOk(`Agent "${d.name}" registered`);
      setNewName('');
      load();
    } catch { setErr('Network error'); } finally { setRegistering(false); }
  };

  // Manual register with existing pubkey
  const handleRegister = async () => {
    if (!newPubkey.trim() || !newName.trim()) return;
    setRegistering(true); setErr(''); setOk('');
    try {
      const r = await apiFetch('/agents/register', { method: 'POST', body: JSON.stringify({ pubkeyB58: newPubkey.trim(), name: newName.trim(), scopes: '*' }) });
      const d = await r.json();
      if (!r.ok) { setErr(d.detail ?? 'Failed'); return; }
      setOk(`Agent "${d.name}" registered`);
      setNewName(''); setNewPubkey('');
      load();
    } catch { setErr('Network error'); } finally { setRegistering(false); }
  };

  const handleRevoke = async (id: number) => { try { await apiFetch(`/agents/${id}`, { method: 'DELETE' }); setAgentList(prev => prev.filter(a => a.id !== id)); } catch {} };

  return (
    <div className="space-y-5">
      <Card title="Agent Authentication" description="Agents authenticate with their own ed25519 keypair. Register the agent's public key here once.">
        <div className="grid grid-cols-3 gap-3">
          {[
            { s: '1', t: 'Generate Keypair', d: 'Agent generates an ed25519 key.' },
            { s: '2', t: 'Register Pubkey',  d: 'Owner registers the public key here.' },
            { s: '3', t: 'Self-Authenticate', d: 'Agent signs a server challenge on each run.' },
          ].map(({ s, t, d }) => (
            <div key={s} className="rounded-lg border border-[#243365] bg-[#0e1631] p-3">
              <div className="text-[10px] text-white font-mono mb-1">Step {s}</div>
              <div className="text-[12px] text-white font-medium mb-1">{t}</div>
              <div className="text-[11px] text-[#8a96c2]">{d}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Registered Agents" headerRight={<button onClick={load} className="text-[#8a96c2] hover:text-white transition-colors"><RefreshCw size={12} className={loading ? 'animate-spin' : ''} /></button>}>
        {agentList.length === 0 && !loading && <p className="text-[12px] text-[#5e6a91] text-center py-4">No agents registered yet</p>}
        {agentList.map(a => (
          <div key={a.id} className="flex items-center gap-4 px-4 py-3 border-b border-[#243365]/30 last:border-0">
            <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-[#243365] flex items-center justify-center shrink-0"><Bot size={14} className="text-white" /></div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-white font-medium">{a.name}</span>
                <Badge variant="neutral">{a.scopes}</Badge>
                {a.last_used_at && <Badge variant="success" dot>Active</Badge>}
              </div>
              <div className="text-[11px] text-[#5e6a91] font-mono mt-0.5">{a.pubkey_b58.slice(0, 16)}…{a.pubkey_b58.slice(-8)}</div>
            </div>
            <Button variant="destructive" size="sm" onClick={() => handleRevoke(a.id)}>Revoke</Button>
          </div>
        ))}
      </Card>

      <Card title="Register a New Agent">
        {err && <div className="px-3 py-2 rounded-lg bg-red-950/30 border border-red-900/50 mb-3"><AlertCircle size={13} className="text-red-400 inline mr-1" /><span className="text-[12px] text-red-300">{err}</span></div>}
        {ok && <div className="px-3 py-2 rounded-lg bg-emerald-950/30 border border-emerald-900/50 mb-3"><span className="text-[12px] text-emerald-300">{ok}</span></div>}

        {/* Private key — shown once after generation */}
        {newPrivkey && (
          <div className="mb-4 rounded-lg border border-amber-800/60 bg-amber-950/20 p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <AlertTriangle size={12} className="text-amber-400 shrink-0" />
              <span className="text-[11px] text-amber-300 font-medium">Save your private key now — it will not be shown again</span>
            </div>
            <div className="flex items-start gap-2">
              <code className="text-[11px] font-mono text-amber-200 break-all flex-1">{newPrivkey}</code>
              <CopyButton text={newPrivkey} />
            </div>
            <div className="mt-2 text-[10px] text-[#8a96c2]">Base64-encoded ed25519 seed · use with PyNaCl: <code className="text-[#a0aacc]">nacl.signing.SigningKey(base64.b64decode(key))</code></div>
          </div>
        )}

        <div className="space-y-3">
          {/* One-click: generate keypair + register together */}
          <div>
            <div className="text-[10px] text-[#8a96c2] uppercase tracking-wider mb-2">Quick — Generate &amp; Register in one click</div>
            <div className="flex gap-2">
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="trading-bot-v1" className="flex-1" />
              <Button variant="primary" size="md" onClick={handleGenerateAndRegister} disabled={registering || !newName.trim()} loading={registering}>
                Generate &amp; Register
              </Button>
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-2 py-1">
            <div className="flex-1 border-t border-[#243365]/50" />
            <span className="text-[10px] text-[#5e6a91]">or paste existing pubkey</span>
            <div className="flex-1 border-t border-[#243365]/50" />
          </div>

          {/* Manual: paste own pubkey */}
          <div className="space-y-2">
            <div className="text-[10px] text-[#8a96c2] uppercase tracking-wider">Manual — bring your own keypair</div>
            <Input label="Agent Name" value={newName} onChange={e => setNewName(e.target.value)} placeholder="trading-bot-v1" />
            <Input label="Public Key (base58)" value={newPubkey} onChange={e => setNewPubkey(e.target.value)} placeholder="9WzDX…" monospace />
            <Button variant="secondary" size="md" onClick={handleRegister} disabled={registering || !newName.trim() || !newPubkey.trim()} loading={registering}>
              Register
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};
