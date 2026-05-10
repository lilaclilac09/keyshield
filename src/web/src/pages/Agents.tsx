import { useState, useCallback } from 'react';
import { Users, Plus, Trash2, Copy, Check, RefreshCw, Loader2, Bot } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Badge, Skeleton, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Input, Label } from '@keyshield/ui';
import { useAgents } from '@keyshield/shared/hooks/use-agents';
import { relTime } from '@keyshield/shared/lib/time';

export default function Agents() {
  const { agents, isLoading, register, revoke } = useAgents();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  async function handleRegister() {
    if (!newName.trim()) return;
    await register({ name: newName.trim() });
    setNewName('');
    setDialogOpen(false);
  }

  async function handleRevoke(id: string) {
    setRevokingId(id);
    try { await revoke(id); } finally { setRevokingId(null); }
  }

  const handleCopy = async (id: string) => {
    await navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (isLoading) return <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ color: '#f8f8f8' }}>Agents</h1>
          <p className="page-header-subtitle">AI agent identity registry with scoped API access</p>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Register Agent
        </Button>
      </div>

      {agents.length === 0 ? (
        <Card className="border-[#0f0f0f] shadow-sm bg-[#080808]">
          <CardContent className="py-12 text-center">
            <Bot className="h-10 w-10 mx-auto mb-3" style={{ color: '#f8f8f8' }} />
            <h3 className="text-lg font-medium mb-1" style={{ color: '#f8f8f8' }}>No agents registered</h3>
            <p className="text-sm mb-4" style={{ color: '#f8f8f8' }}>Register your first AI agent to enable scoped API access</p>
            <Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> Register Agent</Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-[#0f0f0f] shadow-sm bg-[#080808]">
          <CardHeader><CardTitle style={{ color: '#f8f8f8' }}>Registered Agents ({agents.length})</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#f8f8f8' }}>Name</TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#f8f8f8' }}>Agent ID</TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#f8f8f8' }}>Status</TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#f8f8f8' }}>Last Seen</TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#f8f8f8' }}>Created</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agents.map(a => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium" style={{ color: '#f8f8f8' }}>{a.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs" style={{ color: '#f8f8f8' }}>{a.agent_id.slice(0, 12)}...</span>
                        <button onClick={() => handleCopy(a.agent_id)} className="text-[#888] hover:text-white transition-colors" title="Copy ID">
                          {copiedId === a.agent_id ? <Check className="h-3 w-3 text-[#34d399]" /> : <Copy className="h-3 w-3" />}
                        </button>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant={a.is_active ? 'success' : 'secondary'}>{a.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
                    <TableCell style={{ color: '#f8f8f8' }}>{a.last_seen_at ? relTime(new Date(a.last_seen_at).getTime() / 1000) : 'Never'}</TableCell>
                    <TableCell style={{ color: '#f8f8f8' }}>{relTime(new Date(a.created_at).getTime() / 1000)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => handleRevoke(a.id)} disabled={revokingId === a.id}>
                        {revokingId === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" style={{ color: '#f8f8f8' }} />}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-[#080808] border-[#141414]">
          <DialogHeader><DialogTitle style={{ color: '#f8f8f8' }}>Register Agent</DialogTitle><DialogDescription>Create a new agent identity for API access</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="agent-name" className="text-xs uppercase tracking-wider text-[#666]">Agent Name</Label>
              <Input id="agent-name" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Trading Bot" className="bg-[#0a0a0a] border-[#141414] text-white" />
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
