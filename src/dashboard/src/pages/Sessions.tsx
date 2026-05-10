import { Monitor, LogOut } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Badge, Skeleton } from '@keyshield/ui';
import { useSessions } from '@keyshield/shared/hooks/use-sessions';
import { relTime } from '@keyshield/shared/lib/time';

export default function Sessions() {
  const { sessions, isLoading, revoke } = useSessions();

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ color: '#707070' }}>Sessions</h1>
          <p className="page-header-subtitle">Active and recent authentication sessions</p>
        </div>
      </div>
      <Card className="border-[#0f0f0f] shadow-sm bg-[#080808]">
        <CardHeader><CardTitle style={{ color: '#707070' }}>Active Sessions</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#808080' }}>IP Address</TableHead><TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#808080' }}>User Agent</TableHead><TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#808080' }}>Last Active</TableHead><TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#808080' }}>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {sessions.map(s => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-sm" style={{ color: '#606060' }}>{s.ip_address}</TableCell>
                  <TableCell className="text-xs truncate" style={{ color: '#505050', maxWidth: 200 }}>{s.user_agent}</TableCell>
                  <TableCell style={{ color: '#505050' }}>{relTime(s.last_active_at)}</TableCell>
                  <TableCell><Badge variant={s.is_current ? 'success' : 'secondary'}>{s.is_current ? 'Current' : 'Active'}</Badge></TableCell>
                  <TableCell>
                    {!s.is_current && <Button variant="ghost" size="sm" onClick={() => revoke(s.id)}><LogOut className="h-4 w-4 mr-1.5" style={{ color: '#606060' }} /> Revoke</Button>}
                  </TableCell>
                </TableRow>
              ))}
              {sessions.length === 0 && <TableRow><TableCell colSpan={5} className="text-center" style={{ color: '#505050' }}>No sessions</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
