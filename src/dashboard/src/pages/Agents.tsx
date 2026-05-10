import { useState } from 'react';
import { Users, Plus, Trash2 } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Badge, Skeleton, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Input, Label } from '@keyshield/ui';
import { useAgents } from '@keyshield/shared/hooks/use-agents';
import { relTime } from '@keyshield/shared/lib/time';

export default function Agents() {
  const { agents, isLoading, register, revoke } = useAgents();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');

  async function handleRegister() {
    if (!newName.trim()) return;
    await register({ name: newName.trim() });
    setNewName('');
    setDialogOpen(false);
  }

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ color: '#707070' }}>Agents</h1>
          <p className="page-header-subtitle">AI agent identity registry</p>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" style={{ color: '#808080' }} /> Register Agent
        </Button>
      </div>

      <Card className="border-[#0f0f0f] shadow-sm bg-[#080808]">
        <CardHeader><CardTitle style={{ color: '#707070' }}>Registered Agents</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#808080' }}>Name</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#808080' }}>Agent ID</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#808080' }}>Status</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#808080' }}>Last Seen</TableHead>
                <TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#808080' }}>Created</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.map(a => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium" style={{ color: '#707070' }}>{a.name}</TableCell>
                  <TableCell className="font-mono text-xs" style={{ color: '#505050' }}>{a.agent_id.slice(0, 12)}...</TableCell>
                  <TableCell><Badge variant={a.is_active ? 'success' : 'secondary'}>{a.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
                  <TableCell style={{ color: '#505050' }}>{a.last_seen_at ? relTime(a.last_seen_at) : 'Never'}</TableCell>
                  <TableCell style={{ color: '#505050' }}>{relTime(a.created_at)}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => revoke(a.id)}>
                      <Trash2 className="h-4 w-4" style={{ color: '#606060' }} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {agents.length === 0 && <TableRow><TableCell colSpan={6} className="text-center" style={{ color: '#505050' }}>No agents registered</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-[#080808] border-[#141414]">
          <DialogHeader><DialogTitle style={{ color: '#707070' }}>Register Agent</DialogTitle><DialogDescription>Create a new agent identity for API access</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="agent-name" className="text-xs uppercase tracking-wider text-[#606060]">Agent Name</Label>
              <Input id="agent-name" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Trading Bot" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleRegister} disabled={!newName.trim()}>Register</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
