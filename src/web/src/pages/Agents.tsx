import { useState, useCallback } from 'react';
import { Users, Plus, Trash2, Copy, Check, Loader2, Bot } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Badge, Skeleton, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Input, Label } from '@keyshield/ui';
import { useAgents } from '@keyshield/shared/hooks/use-agents';
import { relTime } from '@keyshield/shared/lib/time';
import CreateAgentSignerButton from '../components/CreateAgentSignerButton';

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

  if (isLoading) return (
    <div>
      <Skeleton className="h-40 rounded-xl bg-[#111]" />
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Agents</h1>
          <p className="page-header-subtitle">AI agent identities with scoped API access</p>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Register Agent
        </Button>
      </div>

      {agents.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Bot size={20} />
          </div>
          <h3>No agents registered</h3>
          <p>Register your first AI agent to enable scoped API access</p>
          <button className="ks-btn-primary" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" /> Register Agent
          </button>
        </div>
      ) : (
        <div className="ks-card">
          <div className="ks-card-content" style={{ padding: 0 }}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Agent ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Seen</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>On-chain</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agents.map(a => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium text-white">{a.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs" style={{ color: '#6b6b7a' }}>{a.agent_id.slice(0, 12)}...</span>
                        <button onClick={() => handleCopy(a.agent_id)} className="hover:text-white transition-colors" style={{ color: '#6b6b7a' }} title="Copy ID">
                          {copiedId === a.agent_id ? <Check className="h-3 w-3 text-[#10b981]" /> : <Copy className="h-3 w-3" />}
                        </button>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant={a.is_active ? 'success' : 'secondary'}>{a.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
                    <TableCell style={{ color: '#6b6b7a' }}>{a.last_seen_at ? relTime(new Date(a.last_seen_at).getTime() / 1000) : 'Never'}</TableCell>
                    <TableCell style={{ color: '#6b6b7a' }}>{relTime(new Date(a.created_at).getTime() / 1000)}</TableCell>
                    <TableCell>
                      <CreateAgentSignerButton agentId={a.agent_id} />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => handleRevoke(a.id)} disabled={revokingId === a.id}>
                        {revokingId === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-[#ef4444]" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-[#141418] border-[#1e1e24]">
          <DialogHeader>
            <DialogTitle>Register Agent</DialogTitle>
            <DialogDescription>Create a new agent identity for API access</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="agent-name" className="text-xs uppercase tracking-wider" style={{ color: '#6b6b7a' }}>Agent Name</Label>
              <Input id="agent-name" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Trading Bot" className="bg-[#111114] border-[#1e1e24] text-white placeholder:text-[#4a4a56]" />
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
