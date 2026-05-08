import React, { useEffect, useMemo, useState } from 'react';
import { LogOut, RefreshCw } from 'lucide-react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { apiFetch, getToken, getWalletAddress, getPasskeyTrust } from '../lib/auth';
import { relTime } from '../lib/time';

interface SessionRow { token_id: string; device_label?: string | null; ip?: string | null; user_agent?: string | null; last_seen_at?: number | null; expires_at?: number | null; is_current: boolean; }

const maskIp = (ip: string | null | undefined): string => { if (!ip) return '\u2014'; if (ip === '127.0.0.1' || ip.startsWith('::1')) return ip; const parts = ip.split('.'); if (parts.length === 4) return `${parts[0]}.${parts[1]}.x.x`; return ip.slice(0, Math.min(8, ip.length)) + '\u2026'; };
const fmtCountdown = (expiresAt: number | null | undefined): string => { if (!expiresAt) return '\u2014'; const ms = expiresAt * 1000 - Date.now(); if (ms <= 0) return 'expired'; const h = Math.floor(ms / 3_600_000); const m = Math.floor((ms % 3_600_000) / 60_000); if (h >= 1) return `expires in ${h}h ${m}m`; return `expires in ${m}m`; };

export const SessionsSection: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
  const token = getToken() ?? '';
  const wallet = getWalletAddress() ?? '\u2014';
  const [list, setList] = useState<SessionRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [logoutPending, setLogoutPending] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 60000); return () => window.clearInterval(id); }, []);
  void now;

  const load = async () => { setLoading(true); try { const r = await apiFetch('/sessions/list'); if (r.status === 404) { setList(null); return; } if (!r.ok) return; const d = await r.json(); setList(Array.isArray(d.sessions) ? d.sessions : []); } catch {} finally { setLoading(false); } };
  useEffect(() => { load(); }, []);

  const current = useMemo(() => list?.find(s => s.is_current) ?? null, [list]);
  const others = useMemo(() => (list ?? []).filter(s => !s.is_current), [list]);

  const revokeOne = async (tokenId: string) => { setRevoking(tokenId); try { const r = await apiFetch(`/sessions/${tokenId}/revoke`, { method: 'POST' }); if (r.ok) setList(prev => (prev ?? []).filter(s => s.token_id !== tokenId)); } catch {} finally { setRevoking(null); } };
  const revokeCurrent = async () => { setLogoutPending(true); try { await apiFetch('/auth/logout', { method: 'POST' }); } catch {} onLogout(); };
  const expiringSoon = current?.expires_at && (current.expires_at * 1000 - Date.now() < 3_600_000);

  return (
    <div className="space-y-4">
      <Card title="Current Session" headerRight={<Badge variant={expiringSoon ? 'warning' : 'success'} dot>{expiringSoon ? 'Expiring Soon' : 'Active'}</Badge>}>
        <div className="space-y-2">
          <div className="flex items-center justify-between px-3 py-2 rounded-[2px] bg-[#050505] border border-zinc-800"><span className="text-[11px] text-zinc-500">Token</span><code className="text-[12px] font-mono text-zinc-300">{token ? `${token.slice(0,8)}\u2026${token.slice(-8)}` : '\u2014'}</code></div>
          <div className="flex items-center justify-between px-3 py-2 rounded-[2px] bg-[#050505] border border-zinc-800"><span className="text-[11px] text-zinc-500">Wallet</span><code className="text-[12px] font-mono text-zinc-300">{wallet.length > 12 ? `${wallet.slice(0,6)}\u2026${wallet.slice(-6)}` : wallet}</code></div>
          <div className="flex items-center justify-between px-3 py-2 rounded-[2px] bg-[#050505] border border-zinc-800"><span className="text-[11px] text-zinc-500">Auth</span><span className="text-[12px] text-zinc-300">{getPasskeyTrust() ? 'Passkey \xb7 WebAuthn' : 'Solana wallet \xb7 ed25519'}</span></div>
          <div className="flex items-center justify-between px-3 py-2 rounded-[2px] bg-[#050505] border border-zinc-800"><span className="text-[11px] text-zinc-500">Expires</span><span className="text-[12px] text-zinc-300">{current?.expires_at ? fmtCountdown(current.expires_at) : '\u2264 24 hours'}</span></div>
          {current?.ip && <div className="flex items-center justify-between px-3 py-2 rounded-[2px] bg-[#050505] border border-zinc-800"><span className="text-[11px] text-zinc-500">IP</span><code className="text-[12px] font-mono text-zinc-400">{maskIp(current.ip)}</code></div>}
          {current?.device_label && <div className="flex items-center justify-between px-3 py-2 rounded-[2px] bg-[#050505] border border-zinc-800"><span className="text-[11px] text-zinc-500">Device</span><span className="text-[12px] text-zinc-300">{current.device_label}</span></div>}
        </div>
        <div className="mt-4"><Button variant="destructive" size="md" fullWidth onClick={revokeCurrent} disabled={logoutPending} loading={logoutPending}><LogOut size={12} />Sign Out</Button></div>
      </Card>

      <Card title="Other Active Sessions" headerRight={<button onClick={load} className="text-zinc-500 hover:text-white"><RefreshCw size={12} className={loading ? 'animate-spin' : ''} /></button>}>
        {!loading && others.length === 0 && <p className="text-[12px] text-zinc-600 text-center py-4">No other devices signed in</p>}
        {others.map(s => (
          <div key={s.token_id} className="flex items-center gap-4 px-4 py-3 border-b border-zinc-800/30 last:border-0">
            <div className="w-8 h-8 rounded-[2px] bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0"><span className="text-[11px] text-white">{s.device_label ? s.device_label[0].toUpperCase() : '?'}</span></div>
            <div className="flex-1 min-w-0"><div className="text-[13px] text-white font-medium">{s.device_label || 'Unknown device'}</div><div className="text-[11px] text-zinc-600 mt-0.5 flex gap-3">{s.ip && <span className="font-mono">{maskIp(s.ip)}</span>}{s.last_seen_at && <span>last seen {relTime(s.last_seen_at)}</span>}{s.expires_at && <span>{fmtCountdown(s.expires_at)}</span>}</div></div>
            <Button variant="destructive" size="sm" onClick={() => revokeOne(s.token_id)} disabled={revoking === s.token_id} loading={revoking === s.token_id}>Revoke</Button>
          </div>
        ))}
      </Card>
    </div>
  );
};
