import { useState, useCallback } from 'react';
import { Monitor, LogOut, RefreshCw, Shield, Copy, Check, Globe, Smartphone, Bot, Loader2 } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Badge, Skeleton } from '@keyshield/ui';
import { useSessions } from '@keyshield/shared/hooks/use-sessions';
import { relTime } from '@keyshield/shared/lib/time';
import { isAuthenticated, disconnectWallet, getToken } from '@keyshield/shared/auth';
import { useNavigate } from 'react-router';

function deviceIcon(userAgent: string) {
  if (!userAgent) return <Globe className="h-4 w-4" style={{ color: '#6b6b7a' }} />;
  if (/Mobile|Android|iPhone/i.test(userAgent)) return <Smartphone className="h-4 w-4" style={{ color: '#6b6b7a' }} />;
  if (/Bot|Agent|Crawler/i.test(userAgent)) return <Bot className="h-4 w-4" style={{ color: '#6b6b7a' }} />;
  return <Monitor className="h-4 w-4" style={{ color: '#6b6b7a' }} />;
}

function maskIp(ip: string | null | undefined): string {
  if (!ip) return '\u2014';
  if (ip === '127.0.0.1' || ip.startsWith('::1')) return ip;
  const parts = ip.split('.');
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.x.x`;
  return ip.slice(0, 8) + '\u2026';
}

export default function Sessions() {
  const { sessions, isLoading, revoke, refetch } = useSessions();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const token = getToken() ?? '';
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const shortToken = token ? `${token.slice(0, 8)}\u2026${token.slice(-4)}` : '';

  const handleLogout = useCallback(() => {
    disconnectWallet();
    navigate('/login');
  }, [navigate]);

  if (isLoading) return (
    <div>
      <Skeleton className="h-20 rounded-xl bg-[#111]" />
      <Skeleton className="h-40 rounded-xl bg-[#111] mt-4" />
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Sessions</h1>
          <p className="page-header-subtitle">Manage active sessions and authentication</p>
        </div>
      </div>

      {/* Token info */}
      {token && (
        <div className="ks-card mb-6">
          <div className="ks-card-content">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <Shield size={20} style={{ color: '#6366f1' }} />
                <div>
                  <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#6b6b7a' }}>Current Session Token</p>
                  <p className="font-mono text-sm text-white">{shortToken}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(token);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors hover:bg-white/5"
                  style={{ borderColor: '#1e1e24', color: '#6b6b7a' }}
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-[#10b981]" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <Button variant="destructive" size="sm" onClick={handleLogout}>
                  <LogOut className="h-4 w-4 mr-1.5" /> Sign Out
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="ks-card">
        <div className="ks-card-header">
          <div className="flex items-center justify-between">
            <div className="ks-card-title">Active Sessions ({sessions.length})</div>
            <Button variant="ghost" size="sm" onClick={() => refetch?.()} className="text-[#a0a0b0]">
              <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
            </Button>
          </div>
        </div>
        <div className="ks-card-content" style={{ padding: 0 }}>
          {sessions.length === 0 ? (
            <div className="empty-state" style={{ padding: '48px 24px', border: 'none', background: 'transparent' }}>
              <div className="empty-state-icon">
                <Shield className="h-5 w-5" style={{ color: '#4a4a56' }} />
              </div>
              <h3>No active sessions</h3>
            </div>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Device</TableHead><TableHead>IP Address</TableHead><TableHead>Last Active</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {sessions.map(s => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {deviceIcon(s.user_agent)}
                        <span className="text-xs truncate" style={{ color: '#6b6b7a', maxWidth: 200 }}>{s.user_agent?.slice(0, 50) ?? '\u2014'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm" style={{ color: '#6b6b7a' }}>{maskIp(s.ip_address)}</TableCell>
                    <TableCell style={{ color: '#6b6b7a' }}>{s.last_active_at ? relTime(new Date(s.last_active_at).getTime() / 1000) : '\u2014'}</TableCell>
                    <TableCell><Badge variant={s.is_current ? 'success' : 'secondary'}>{s.is_current ? 'Current' : 'Active'}</Badge></TableCell>
                    <TableCell>
                      {!s.is_current && (
                        <Button variant="ghost" size="sm" onClick={async () => {
                          setRevokingId(s.id);
                          try { await revoke(s.id); } finally { setRevokingId(null); }
                        }} disabled={revokingId === s.id} className="text-[#a0a0b0]">
                          {revokingId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><LogOut className="h-4 w-4 mr-1.5" /> Revoke</>}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
