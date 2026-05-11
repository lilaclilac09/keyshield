import React, { useState, useEffect, useCallback } from 'react';
import { Bot, Plus, RefreshCw, AlertCircle } from 'lucide-react';
import { Card, StatCard } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { apiFetch } from '../../lib/auth';

interface AgentEntry { id: number; pubkey_b58: string; name: string; scopes: string; created_at: number; last_used_at: number | null; }

const _b58Encode = (bytes: Uint8Array): string => { const ALPHA = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'; let n = BigInt('0x' + Array.from(bytes).map(b => b.toString(16).padStart(2,'0')).join('')); let res = ''; while (n > 0n) { const r = Number(n % 58n); n /= 58n; res = ALPHA[r] + res; } const pad = bytes.findIndex(b => b !== 0); return '1'.repeat(pad < 0 ? 0 : pad) + res; };

export const AgentsSection: React.FC = () => {
  const [agentList, setAgentList] = useState<AgentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newPubkey, setNewPubkey] = useState('');
  const [registering, setRegistering] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const load = useCallback(async () => { try { const r = await apiFetch('/agents/list'); if (r.ok) { const d = await r.json(); setAgentList(d.agents ?? []); } } catch {} finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);

  const generateKeypair = async () => { try { const kp = await window.crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']); const privRaw = await window.crypto.subtle.exportKey('pkcs8', kp.privateKey); const pubRaw = await window.crypto.subtle.exportKey('raw', kp.publicKey); const pubBytes = new Uint8Array(pubRaw); const pubB58 = _b58Encode(pubBytes); setNewPubkey(pubB58); } catch {} };

  const handleRegister = async () => { if (!newPubkey.trim() || !newName.trim()) return; setRegistering(true); setErr(''); setOk(''); try { const r = await apiFetch('/agents/register', { method: 'POST', body: JSON.stringify({ pubkeyB58: newPubkey.trim(), name: newName.trim(), scopes: '*' }) }); const d = await r.json(); if (!r.ok) { setErr(d.detail ?? 'Failed'); return; } setOk(`Agent "${d.name}" registered`); setNewName(''); setNewPubkey(''); load(); } catch { setErr('Network error'); } finally { setRegistering(false); } };

  const handleRevoke = async (id: number) => { try { await apiFetch(`/agents/${id}`, { method: 'DELETE' }); setAgentList(prev => prev.filter(a => a.id !== id)); } catch {} };

  return (
    <div className="space-y-5">
      <Card title="Agent Authentication" description="Agents authenticate with their own ed25519 keypair. Register the agent\'s public key here once.">
        <div className="grid grid-cols-3 gap-3">
          {[{ s: '1', t: 'Generate Keypair', d: 'Agent generates an ed25519 key.' }, { s: '2', t: 'Register Pubkey', d: 'Owner registers the public key here.' }, { s: '3', t: 'Self-Authenticate', d: 'Agent signs a server challenge on each run.' }].map(({ s, t, d }) => (
            <div key={s} className="rounded-lg border border-[#243365] bg-[#0e1631] p-3"><div className="text-[10px] text-white font-mono mb-1">Step {s}</div><div className="text-[12px] text-white font-medium mb-1">{t}</div><div className="text-[11px] text-[#8a96c2]">{d}</div></div>
          ))}
        </div>
      </Card>

      <Card title="Registered Agents" headerRight={<button onClick={load} className="text-[#8a96c2] hover:text-white transition-colors"><RefreshCw size={12} className={loading ? 'animate-spin' : ''} /></button>}>
        {agentList.length === 0 && !loading && <p className="text-[12px] text-[#5e6a91] text-center py-4">No agents registered yet</p>}
        {agentList.map(a => (
          <div key={a.id} className="flex items-center gap-4 px-4 py-3 border-b border-[#243365]/30 last:border-0">
            <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-[#243365] flex items-center justify-center shrink-0"><Bot size={14} className="text-white" /></div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2"><span className="text-[13px] text-white font-medium">{a.name}</span><Badge variant="neutral">{a.scopes}</Badge>{a.last_used_at && <Badge variant="success" dot>Active</Badge>}</div>
              <div className="text-[11px] text-[#5e6a91] font-mono mt-0.5">{a.pubkey_b58.slice(0, 16)}\u2026{a.pubkey_b58.slice(-8)}</div>
            </div>
            <Button variant="destructive" size="sm" onClick={() => handleRevoke(a.id)}>Revoke</Button>
          </div>
        ))}
      </Card>

      <Card title="Register a New Agent">
        {err && <div className="px-3 py-2 rounded-lg bg-red-950/30 border border-red-900/50 mb-3"><AlertCircle size={13} className="text-red-400 inline mr-1" /><span className="text-[12px] text-red-300">{err}</span></div>}
        {ok && <div className="px-3 py-2 rounded-lg bg-emerald-950/30 border border-emerald-900/50 mb-3"><span className="text-[12px] text-emerald-300">{ok}</span></div>}
        <div className="space-y-3">
          <div className="flex items-center justify-between"><span className="text-[10px] text-[#8a96c2] uppercase tracking-wider">Step 1 \u2014 Generate Keypair</span><Button variant="secondary" size="sm" onClick={generateKeypair}>Generate</Button></div>
          {newPubkey && <div className="rounded-lg border border-[#243365] bg-[#0e1631] p-3"><div className="text-[10px] text-[#5e6a91] mb-1">Public key (paste below)</div><code className="text-[11px] font-mono text-emerald-300 break-all">{newPubkey}</code></div>}
          <div className="space-y-2">
            <span className="text-[10px] text-[#8a96c2] uppercase tracking-wider">Step 2 \u2014 Register</span>
            <Input label="Agent Name" value={newName} onChange={e => setNewName(e.target.value)} placeholder="trading-bot-v1" />
            <Input label="Public Key (base58)" value={newPubkey} onChange={e => setNewPubkey(e.target.value)} placeholder="9WzDX\u2026" monospace />
            <div className="flex gap-2"><Button variant="primary" size="md" onClick={handleRegister} disabled={registering || !newName.trim() || !newPubkey.trim()} loading={registering}>Register</Button></div>
          </div>
        </div>
      </Card>
    </div>
  );
};
