import React, { useEffect, useMemo, useState } from 'react';
import { LogOut, Loader2, Monitor, Smartphone, Globe, Shield, Bot, RefreshCw } from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
import { apiFetch, getToken, getWalletAddress, getPasskeyTrust } from '../../lib/auth';
import { useCopyable } from '../ui/CopyButton';
import { ConfirmButton } from '../ui/ConfirmButton';
import { relTime } from '../../lib/time';

interface SessionRow {
  token_id:      string;
  device_label?: string | null;
  ip?:           string | null;
  user_agent?:   string | null;
  last_seen_at?: number | null;
  expires_at?:   number | null;
  created_at?:   number | null;
  is_current:    boolean;
  agent_id?:     number | null;
  scopes?:       string | null;
}

const maskIp = (ip: string | null | undefined): string => {
  if (!ip) return '—';
  if (ip === '127.0.0.1' || ip.startsWith('::1')) return ip;
  const parts = ip.split('.');
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.x.x`;
  return ip.slice(0, Math.min(8, ip.length)) + '…';
};

const fmtCountdown = (expiresAt: number | null | undefined): string => {
  if (!expiresAt) return '—';
  const ms = expiresAt * 1000 - Date.now();
  if (ms <= 0) return 'expired';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 1) return `expires in ${h}h ${m}m`;
  return `expires in ${m}m`;
};

const detectAuthMethod = (walletConnected: boolean, walletName?: string | null): string => {
  if (getPasskeyTrust()) return 'Passkey · WebAuthn';
  if (walletConnected) return `${walletName ?? 'Solana wallet'} · ed25519`;
  return 'Password · session token';
};

export const SessionsSection: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
  const token   = getToken() ?? '';
  const wallet  = getWalletAddress() ?? '—';
  const walletAdapter = useWallet();
  const { copied: tokCopied, copy: copyTok } = useCopyable(token);

  const [list, setList]         = useState<SessionRow[] | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [logoutPending, setLogoutPending] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Refresh "expires in" countdowns once a minute.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(id);
  }, []);
  void now;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiFetch('/sessions/list');
      if (r.status === 404) {
        setList(null);
        setError('Session list endpoint not deployed yet — beta v2 will surface every device.');
        return;
      }
      if (!r.ok) {
        setError(`Failed to load sessions (${r.status})`);
        return;
      }
      const d = await r.json();
      setList(Array.isArray(d.sessions) ? d.sessions : []);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const authMethod = useMemo(
    () => detectAuthMethod(!!walletAdapter.publicKey, walletAdapter.wallet?.adapter.name),
    [walletAdapter.publicKey, walletAdapter.wallet],
  );

  const current = useMemo(() => list?.find(s => s.is_current) ?? null, [list]);
  const others  = useMemo(() => (list ?? []).filter(s => !s.is_current), [list]);

  const revokeOne = async (tokenId: string) => {
    setRevoking(tokenId);
    try {
      const r = await apiFetch(`/sessions/${tokenId}/revoke`, { method: 'POST' });
      if (!r.ok) {
        alert('Revoke failed');
      } else {
        setList(prev => (prev ?? []).filter(s => s.token_id !== tokenId));
      }
    } catch { alert('Network error'); }
    finally { setRevoking(null); }
  };

  const revokeCurrent = async () => {
    setLogoutPending(true);
    try { await apiFetch('/auth/logout', { method: 'POST' }); } catch {}
    onLogout();
  };

  const expiringSoon = current?.expires_at && (current.expires_at * 1000 - Date.now() < 3_600_000);

  return (
    <div className="space-y-4">
      {/* Current session card */}
      <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 overflow-hidden">
        <div className="px-5 py-4 border-b border-[#141a2e] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[13px] text-white font-medium">This session</span>
            <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-950/50 border border-emerald-900/50 text-emerald-400">active</span>
            {expiringSoon && (
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-950/50 border border-amber-900/50 text-amber-300">expires soon</span>
            )}
          </div>
          <ConfirmButton
            variant="destructive"
            onConfirm={revokeCurrent}
            disabled={logoutPending}
            title="Revoke this session (logs out only this device)"
            confirmLabel="Confirm sign-out"
            className="h-7 px-3 rounded-lg text-[12px] flex items-center gap-1.5"
          >
            {logoutPending ? <Loader2 size={12} className="animate-spin" /> : <LogOut size={12} />}
            Sign out
          </ConfirmButton>
        </div>

        <div className="divide-y divide-[#0d1020]">
          <Row label="Session token">
            <code className="text-[12px] font-mono text-zinc-300">{token ? `${token.slice(0,8)}…${token.slice(-8)}` : '—'}</code>
            {token && (
              <button
                onClick={copyTok}
                className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                  tokCopied ? 'border-emerald-800 text-emerald-400' : 'border-[#1c2238] text-zinc-500 hover:text-white'
                }`}
              >
                {tokCopied ? 'Copied' : 'Copy'}
              </button>
            )}
          </Row>
          <Row label="Wallet">
            <code className="text-[12px] font-mono text-zinc-300">
              {wallet.length > 12 ? `${wallet.slice(0,6)}…${wallet.slice(-6)}` : wallet}
            </code>
          </Row>
          <Row label="Auth method">
            <span className="text-[12px] text-zinc-300">{authMethod}</span>
          </Row>
          <Row label="Expires">
            {current?.expires_at ? (
              <span className="text-[12px] text-zinc-300">{fmtCountdown(current.expires_at)}</span>
            ) : (
              <span className="text-[12px] text-zinc-500" title="Exact expiry available after backend update">≤ 24 hours</span>
            )}
          </Row>
          {current?.device_label && (
            <Row label="Device">
              <span className="text-[12px] text-zinc-300">{current.device_label}</span>
            </Row>
          )}
          {current?.ip && (
            <Row label="IP">
              <code className="text-[12px] font-mono text-zinc-400">{maskIp(current.ip)}</code>
            </Row>
          )}
        </div>
      </div>

      {/* Other sessions */}
      <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#141a2e] flex items-center justify-between">
          <h3 className="text-[13px] font-medium text-white">Other active sessions{list ? ` · ${others.length}` : ''}</h3>
          <button onClick={load} className="text-zinc-500 hover:text-white transition-colors" title="Refresh">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {error && (
          <div className="px-5 py-3 text-[12px] text-amber-400/90 bg-amber-950/20 border-b border-amber-900/30">
            {error}
          </div>
        )}

        {!loading && !error && others.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-[13px] text-zinc-500">No other devices signed in</p>
            <p className="text-[11px] text-zinc-700 mt-1">Sessions on other browsers, the extension, the CLI, or registered agents would show here.</p>
          </div>
        )}

        {others.map(s => {
          const Icon = s.agent_id != null ? Bot : (s.user_agent?.toLowerCase().includes('mobile') ? Smartphone : (s.user_agent ? Monitor : Globe));
          return (
            <div key={s.token_id} className="flex items-center gap-4 px-5 py-3.5 border-b border-[#0d1020] last:border-0">
              <div className="w-8 h-8 rounded-lg bg-[#0e1430] border border-[#1c2550] flex items-center justify-center shrink-0">
                <Icon size={14} className="text-[#5b8cff]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-white font-medium truncate">{s.device_label || (s.agent_id != null ? `Agent #${s.agent_id}` : 'Unknown device')}</span>
                  {s.scopes && s.scopes !== '*' && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded border border-[#1c2238] text-zinc-500 font-mono">{s.scopes}</span>
                  )}
                </div>
                <div className="text-[11px] text-zinc-600 mt-0.5 flex gap-3 flex-wrap">
                  {s.ip && <span className="font-mono">{maskIp(s.ip)}</span>}
                  {s.last_seen_at && <span>last seen {relTime(s.last_seen_at)}</span>}
                  {s.expires_at && <span>{fmtCountdown(s.expires_at)}</span>}
                </div>
              </div>
              <ConfirmButton
                variant="destructive"
                onConfirm={() => revokeOne(s.token_id)}
                disabled={revoking === s.token_id}
                title="Revoke this session"
                confirmLabel="Confirm"
                className="h-7 px-2 rounded-md text-[11px] flex items-center gap-1"
              >
                {revoking === s.token_id ? <Loader2 size={12} className="animate-spin" /> : <LogOut size={12} />}
                Revoke
              </ConfirmButton>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-zinc-600 text-center flex items-center justify-center gap-1.5">
        <Shield size={11} className="text-zinc-700" />
        Sessions are AES-256-GCM encrypted server-side. Revoke cascades to in-flight tokens.
      </p>
    </div>
  );
};

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="px-5 py-3 flex items-center justify-between">
    <span className="text-[12px] text-zinc-500">{label}</span>
    <div className="flex items-center gap-2">{children}</div>
  </div>
);
