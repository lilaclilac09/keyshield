import { useState, useCallback, useEffect } from 'react';
import { Monitor, LogOut, RefreshCw, Shield, Copy, Check, Globe, Smartphone, Bot, Loader2 } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Badge, Skeleton } from '@keyshield/ui';
import { useSessions } from '@keyshield/shared/hooks/use-sessions';
import { relTime } from '@keyshield/shared/lib/time';
import { isAuthenticated, disconnectWallet, getToken } from '@keyshield/shared/auth';
import { useNavigate } from 'react-router';

function deviceIcon(userAgent: string) {
  if (!userAgent) return <Globe className="h-4 w-4" style={{ color: '#c4c4d0' }} />;
  if (/Mobile|Android|iPhone/i.test(userAgent)) return <Smartphone className="h-4 w-4" style={{ color: '#c4c4d0' }} />;
  if (/Bot|Agent|Crawler/i.test(userAgent)) return <Bot className="h-4 w-4" style={{ color: '#c4c4d0' }} />;
  return <Monitor className="h-4 w-4" style={{ color: '#c4c4d0' }} />;
}

function maskIp(ip: string | null | undefined): string {
  if (!ip) return '—';
  if (ip === '127.0.0.1' || ip.startsWith('::1')) return ip;
  const parts = ip.split('.');
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.x.x`;
  return ip.slice(0, 8) + '…';
}

export default function Sessions() {
  const { sessions, isLoading, revoke, refetch } = useSessions();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const token = getToken() ?? '';
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const shortToken = token ? `${token.slice(0, 8)}…${token.slice(-4)}` : '';

  const handleLogout = useCallback(() => {
    disconnectWallet();
    navigate('/login');
  }, [navigate]);

  if (isLoading) return <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ color: '#f8f8f8' }}>Sessions</h1>
          <p className="page-header-subtitle">Active and recent authentication sessions</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => refetch?.()}>
            <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
          </Button>
          <Button variant="destructive" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-1.5" /> Sign Out
          </Button>
        </div>
      </div>

      {/* Token info */}
      {token && (
        <Card className="border-[#0f0f0f] shadow-sm bg-[#080808] mb-6">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#c4c4d0' }}>Current Session Token</p>
                <p className="font-mono text-sm" style={{ color: '#e0e0e0' }}>{shortToken}</p>
              </div>
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(token);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-[#0a0a0a] hover:bg-[#0f0f0f] transition-colors text-sm"
                style={{ borderColor: '#141414' }}
              >
                {copied ? <Check className="h-3.5 w-3.5 text-[#34d399]" /> : <Copy className="h-3.5 w-3.5" style={{ color: '#888' }} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-[#0f0f0f] shadow-sm bg-[#080808]">
        <CardHeader><CardTitle style={{ color: '#f8f8f8' }}>Active Sessions ({sessions.length})</CardTitle></CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <div className="py-12 text-center">
              <Shield className="h-10 w-10 mx-auto mb-3" style={{ color: '#666' }} />
              <p className="text-sm" style={{ color: '#c4c4d0' }}>No active sessions</p>
            </div>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#888' }}>Device</TableHead><TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#888' }}>IP Address</TableHead><TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#888' }}>Last Active</TableHead><TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#888' }}>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {sessions.map(s => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {deviceIcon(s.user_agent)}
                        <span className="text-xs truncate" style={{ color: '#888', maxWidth: 200 }}>{s.user_agent?.slice(0, 50) ?? '—'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm" style={{ color: '#888' }}>{maskIp(s.ip_address)}</TableCell>
                    <TableCell style={{ color: '#c4c4d0' }}>{s.last_active_at ? relTime(new Date(s.last_active_at).getTime() / 1000) : '—'}</TableCell>
                    <TableCell><Badge variant={s.is_current ? 'success' : 'secondary'}>{s.is_current ? 'Current' : 'Active'}</Badge></TableCell>
                    <TableCell>
                      {!s.is_current && (
                        <Button variant="ghost" size="sm" onClick={async () => {
                          setRevokingId(s.id);
                          try { await revoke(s.id); } finally { setRevokingId(null); }
                        }} disabled={revokingId === s.id}>
                          {revokingId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><LogOut className="h-4 w-4 mr-1.5" /> Revoke</>}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
