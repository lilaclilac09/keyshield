import React, { useState, useEffect, useCallback } from 'react';
import { Share2, ArrowDownLeft, ArrowUpRight, Plus } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input, Select } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { apiFetch } from '../../lib/auth';
import { grantShare, revokeShare, listIncomingShares, listOutgoingShares, type ShareRow } from '../../lib/api';

type Tab = 'incoming' | 'outgoing' | 'new';

export const SharingSection: React.FC<{ addr: string }> = ({ addr }) => {
  const [tab, setTab] = useState<Tab>('incoming');
  const [incoming, setIncoming] = useState<ShareRow[]>([]);
  const [outgoing, setOutgoing] = useState<ShareRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [recipient, setRecipient] = useState('');
  const [expiresStr, setExpiresStr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const [success, setSuccess] = useState('');
  const [stub, setStub] = useState('');
  const [keys, setKeys] = useState<string[]>([]);

  const refresh = useCallback(async () => { setLoading(true); setErr(''); try { const [inc, out] = await Promise.all([listIncomingShares(), listOutgoingShares()]); setIncoming(inc); setOutgoing(out); } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); } finally { setLoading(false); } }, []);
  useEffect(() => { refresh(); (async () => { try { const r = await apiFetch('/manage/vault'); if (r.ok) { const d = await r.json(); setKeys(d.keys ?? []); if (!keyName && (d.keys ?? []).length > 0) setKeyName((d.keys ?? [])[0]); } } catch {} })(); }, [refresh]);

  const submit = async () => { if (!keyName || !recipient || recipient === addr) return; setSubmitting(true); setErr(''); setSuccess(''); setStub(''); try { const input = { key_name: keyName, recipient_user_id: recipient, expires_at: expiresStr ? Math.floor(new Date(expiresStr).getTime() / 1000) : undefined }; const r = await grantShare(input); if (r.status === 501) { setStub(r.detail || 'Sharing not yet implemented.'); } else { setSuccess(`Shared ${keyName} with ${recipient.slice(0, 12)}\u2026`); setRecipient(''); await refresh(); } } catch (e) { setErr(e instanceof Error ? e.message : 'Share failed'); } finally { setSubmitting(false); } };
  const handleRevoke = async (id: number) => { try { await revokeShare(id); await refresh(); } catch {} };

  return (
    <div className="space-y-4">
      <Card title="Sharing" description="Grant teammates read access to specific keys without showing the plaintext." headerRight={<button onClick={refresh} disabled={loading} className="text-[#8a96c2] hover:text-white"><Share2 size={13} className={loading ? 'animate-spin' : ''} /></button>}>
        <div className="flex gap-1 rounded-lg border border-[#243365] bg-[#0e1631] p-1 text-[11px] mb-4">
          {(['incoming', 'outgoing', 'new'] as Tab[]).map(t => <button key={t} onClick={() => setTab(t)} className={`flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${tab === t ? 'bg-white text-black' : 'text-[#a8b3d8] hover:text-white'}`}>{t === 'incoming' ? <ArrowDownLeft size={12} /> : t === 'outgoing' ? <ArrowUpRight size={12} /> : <Plus size={12} />}{t === 'incoming' ? ` Shared with me (${incoming.length})` : t === 'outgoing' ? ` Shared by me (${outgoing.length})` : ' New share'}</button>)}
        </div>

        {err && <p className="text-[12px] text-red-400">{err}</p>}
        {stub && <Badge variant="warning">{stub}</Badge>}
        {success && <Badge variant="success">{success}</Badge>}

        {tab === 'incoming' && (incoming.length === 0 ? <p className="text-[12px] text-[#5e6a91] text-center py-4">Nothing shared with you yet.</p> : incoming.map(s => <div key={s.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[#0e1631] border border-[#243365] mb-1.5"><ArrowDownLeft size={14} className="text-[#8a96c2] shrink-0" /><div className="flex-1 min-w-0"><p className="text-[13px] text-zinc-200"><code className="text-white font-mono">{s.key_name}</code><span className="text-[#5e6a91] mx-1.5">from</span><code className="text-[#a8b3d8] font-mono">{s.owner_id.slice(0, 12)}\u2026</code></p></div></div>))}

        {tab === 'outgoing' && (outgoing.length === 0 ? <p className="text-[12px] text-[#5e6a91] text-center py-4">You haven\'t shared any keys yet.</p> : outgoing.map(s => <div key={s.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[#0e1631] border border-[#243365] mb-1.5"><ArrowUpRight size={14} className="text-[#8a96c2] shrink-0" /><div className="flex-1 min-w-0"><p className="text-[13px] text-zinc-200"><code className="text-white font-mono">{s.key_name}</code><span className="text-[#5e6a91] mx-1.5">to</span><code className="text-[#a8b3d8] font-mono">{s.recipient_id.slice(0, 12)}\u2026</code></p></div><Button variant="destructive" size="sm" onClick={() => handleRevoke(s.id)}>Revoke</Button></div>))}

        {tab === 'new' && (
          <div className="space-y-3">
            {keys.length === 0 ? <p className="text-[12px] text-[#8a96c2] px-3 py-2 rounded-lg bg-[#0e1631] border border-[#243365]">No keys in your vault yet \u2014 add one in Vault first.</p> : <Select label="Key" value={keyName} onChange={e => setKeyName(e.target.value)}>{keys.map(k => <option key={k} value={k}>{k}</option>)}</Select>}
            <Input label="Recipient (wallet address or userId)" value={recipient} onChange={e => setRecipient(e.target.value.trim())} placeholder="9WzDX\u2026 (Solana wallet)" />
            <Input label="Expires (optional)" type="date" value={expiresStr} onChange={e => setExpiresStr(e.target.value)} />
            <Button variant="primary" size="md" fullWidth onClick={submit} disabled={!keyName || !recipient || recipient === addr || submitting || keys.length === 0} loading={submitting}>Grant Share</Button>
            {recipient === addr && recipient !== '' && <p className="text-[11px] text-amber-400">You can\'t share a key with yourself.</p>}
          </div>
        )}
      </Card>
    </div>
  );
};
