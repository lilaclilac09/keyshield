import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Share2, Plus, ArrowDownLeft, ArrowUpRight, Trash2, Loader2,
  AlertCircle, Check, RefreshCw, ShieldAlert,
} from 'lucide-react';
import {
  ShareRow, GrantShareInput,
  listIncomingShares, listOutgoingShares, grantShare, revokeShare,
} from '../../lib/api';
import { apiFetch } from '../../lib/auth';

type Tab = 'incoming' | 'outgoing' | 'new';

export const SharingSection: React.FC<{ addr: string }> = ({ addr }) => {
  const [tab, setTab] = useState<Tab>('incoming');
  const [incoming, setIncoming] = useState<ShareRow[]>([]);
  const [outgoing, setOutgoing] = useState<ShareRow[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [refreshErr, setRefreshErr] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setRefreshErr('');
    try {
      const [inc, out] = await Promise.all([
        listIncomingShares(),
        listOutgoingShares(),
      ]);
      setIncoming(inc);
      setOutgoing(out);
    } catch (e) {
      setRefreshErr(e instanceof Error ? e.message : 'Failed to load shares');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[14px] font-medium text-white flex items-center gap-2">
              <Share2 size={14} className="text-[#5b8cff]" /> Sharing
            </h3>
            <p className="text-[12px] text-zinc-500 mt-0.5">
              Grant teammates read access to specific keys without showing the plaintext.
              The encrypted DEK is re-wrapped to their public key so the server never sees either side.
            </p>
          </div>
          <button onClick={refresh} disabled={loading} className="text-zinc-500 hover:text-white" title="Refresh">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="flex gap-1 rounded-lg border border-[#1c2238] bg-[#070912] p-1 text-[12px]">
          <TabBtn active={tab === 'incoming'} onClick={() => setTab('incoming')}>
            <ArrowDownLeft size={12} /> Shared with me
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#0a0d1a] text-zinc-500">{incoming.length}</span>
          </TabBtn>
          <TabBtn active={tab === 'outgoing'} onClick={() => setTab('outgoing')}>
            <ArrowUpRight size={12} /> Shared by me
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#0a0d1a] text-zinc-500">{outgoing.length}</span>
          </TabBtn>
          <TabBtn active={tab === 'new'} onClick={() => setTab('new')}>
            <Plus size={12} /> New share
          </TabBtn>
        </div>

        {refreshErr && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-950/30 border border-rose-900/50">
            <AlertCircle size={13} className="text-rose-400 shrink-0" />
            <p className="text-[12px] text-rose-300">{refreshErr}</p>
          </div>
        )}

        {tab === 'incoming' && (
          <SharesList
            shares={incoming}
            empty="Nothing shared with you yet."
            mode="incoming"
            onRevoke={undefined /* recipients can't revoke */}
          />
        )}
        {tab === 'outgoing' && (
          <SharesList
            shares={outgoing}
            empty="You haven't shared any keys yet."
            mode="outgoing"
            onRevoke={async id => {
              await revokeShare(id);
              await refresh();
            }}
          />
        )}
        {tab === 'new' && (
          <NewShareForm
            currentUser={addr}
            onGranted={async () => { setTab('outgoing'); await refresh(); }}
          />
        )}
      </div>
    </div>
  );
};


// ─── tab button ────────────────────────────────────────────────────────────

const TabBtn: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = (
  { active, onClick, children },
) => (
  <button
    onClick={onClick}
    className={`flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-[12px] transition-colors ${
      active ? 'bg-[#5b8cff]/20 text-white border border-[#5b8cff]/40' : 'text-zinc-400 hover:text-white border border-transparent'
    }`}
  >
    {children}
  </button>
);


// ─── list of shares ────────────────────────────────────────────────────────

const SharesList: React.FC<{
  shares:    ShareRow[];
  empty:     string;
  mode:      'incoming' | 'outgoing';
  onRevoke?: (id: number) => Promise<void>;
}> = ({ shares, empty, mode, onRevoke }) => {
  const [revokingId, setRevokingId] = useState<number | null>(null);
  const [revokeErr,  setRevokeErr]  = useState('');

  if (shares.length === 0) {
    return <p className="text-[12px] text-zinc-600 text-center py-4">{empty}</p>;
  }
  return (
    <div className="space-y-2">
      {revokeErr && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-950/30 border border-rose-900/50">
          <AlertCircle size={13} className="text-rose-400 shrink-0" />
          <p className="text-[12px] text-rose-300">{revokeErr}</p>
        </div>
      )}
      {shares.map(s => {
        const counterparty = mode === 'incoming' ? s.owner_id : s.recipient_id;
        const labelText    = mode === 'incoming' ? 'from'      : 'to';
        return (
          <div
            key={s.id}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[#070912] border border-[#141a2e]"
          >
            <div className="text-zinc-500 shrink-0">
              {mode === 'incoming' ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-zinc-200 truncate">
                <code className="text-[#5b8cff] font-mono">{s.key_name}</code>
                <span className="text-zinc-600 mx-1.5">{labelText}</span>
                <code className="text-zinc-300 font-mono">{counterparty.slice(0, 12)}…</code>
              </p>
              <p className="text-[11px] text-zinc-600">
                {new Date(s.created_at * 1000).toLocaleDateString()}
                {s.expires_at && ` · expires ${new Date(s.expires_at * 1000).toLocaleDateString()}`}
              </p>
            </div>
            {onRevoke && (
              <button
                onClick={async () => {
                  setRevokingId(s.id);
                  setRevokeErr('');
                  try { await onRevoke(s.id); } catch (e) {
                    setRevokeErr(e instanceof Error ? e.message : 'Revoke failed');
                  } finally { setRevokingId(null); }
                }}
                disabled={revokingId === s.id}
                className="text-zinc-600 hover:text-rose-400 transition-colors"
                title="Revoke"
              >
                {revokingId === s.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};


// ─── new-share form ────────────────────────────────────────────────────────

const NewShareForm: React.FC<{
  currentUser: string;
  onGranted:   () => Promise<void>;
}> = ({ currentUser, onGranted }) => {
  const [keys, setKeys] = useState<string[]>([]);
  const [keyName, setKeyName] = useState('');
  const [recipient, setRecipient] = useState('');
  const [expiresStr, setExpiresStr] = useState('');     // YYYY-MM-DD or empty
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const [success, setSuccess] = useState('');
  const [stub, setStub]       = useState('');

  // Load list of vault keys for the dropdown.
  useEffect(() => {
    (async () => {
      try {
        const r = await apiFetch('/manage/list');
        if (!r.ok) return;
        const data = await r.json();
        const slugs = (data.keys ?? []) as string[];
        setKeys(slugs);
        if (!keyName && slugs.length > 0) setKeyName(slugs[0]);
      } catch { /* ignore */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const expiresAt = useMemo<number | undefined>(() => {
    if (!expiresStr) return undefined;
    const t = new Date(expiresStr).getTime();
    if (Number.isNaN(t)) return undefined;
    return Math.floor(t / 1000);
  }, [expiresStr]);

  const valid = !!keyName && !!recipient && recipient !== currentUser;

  const submit = async () => {
    if (!valid) return;
    setSubmitting(true);
    setErr('');
    setSuccess('');
    setStub('');
    try {
      const input: GrantShareInput = {
        key_name:          keyName,
        recipient_user_id: recipient,
        expires_at:        expiresAt,
      };
      const r = await grantShare(input);
      if (r.status === 501) {
        setStub(r.detail || 'Sharing not yet implemented.');
      } else {
        setSuccess(`Shared ${keyName} with ${recipient.slice(0, 12)}…`);
        setRecipient('');
        await onGranted();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Share failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-wider text-zinc-600">Key</label>
        {keys.length === 0 ? (
          <p className="text-[12px] text-zinc-500 px-3 py-2 rounded-lg bg-[#070912] border border-[#141a2e]">
            No keys in your vault yet — add one in Vault first.
          </p>
        ) : (
          <select
            value={keyName}
            onChange={e => setKeyName(e.target.value)}
            disabled={submitting}
            className="w-full bg-[#070912] border border-[#1c2238] rounded-lg px-3 py-2 text-[13px] text-white focus:outline-none focus:border-[#5b8cff]/50"
          >
            {keys.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-wider text-zinc-600">Recipient (wallet address or userId)</label>
        <input
          type="text"
          value={recipient}
          onChange={e => setRecipient(e.target.value.trim())}
          placeholder="9WzDX… (Solana wallet) or alice"
          disabled={submitting}
          className="w-full bg-[#070912] border border-[#1c2238] rounded-lg px-3 py-2 text-[13px] font-mono text-white placeholder:text-zinc-700 focus:outline-none focus:border-[#5b8cff]/50"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-wider text-zinc-600">Expires (optional)</label>
        <input
          type="date"
          value={expiresStr}
          onChange={e => setExpiresStr(e.target.value)}
          disabled={submitting}
          className="w-full bg-[#070912] border border-[#1c2238] rounded-lg px-3 py-2 text-[13px] text-white focus:outline-none focus:border-[#5b8cff]/50"
        />
      </div>

      {err && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-950/30 border border-rose-900/50">
          <AlertCircle size={13} className="text-rose-400 shrink-0" />
          <p className="text-[12px] text-rose-300">{err}</p>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-950/30 border border-emerald-900/50">
          <Check size={13} className="text-emerald-400 shrink-0" />
          <p className="text-[12px] text-emerald-300">{success}</p>
        </div>
      )}
      {stub && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-950/30 border border-amber-900/50">
          <ShieldAlert size={13} className="text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-[12px] font-medium text-amber-300">Sharing not yet enabled</p>
            <p className="text-[11px] text-amber-200/80 leading-relaxed">{stub}</p>
          </div>
        </div>
      )}

      <button
        onClick={submit}
        disabled={!valid || submitting || keys.length === 0}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-[#5b8cff] hover:bg-[#7aa1ff] disabled:bg-[#1c2238] disabled:text-zinc-500 text-white text-[13px] font-medium transition-colors"
      >
        {submitting
          ? <><Loader2 size={13} className="animate-spin" /> Granting…</>
          : <><Share2 size={13} /> Grant share</>}
      </button>

      {recipient === currentUser && recipient !== '' && (
        <p className="text-[11px] text-amber-400/80 px-1">You can't share a key with yourself.</p>
      )}
    </div>
  );
};
