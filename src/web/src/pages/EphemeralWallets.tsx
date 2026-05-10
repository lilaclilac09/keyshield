import { useState, useEffect, useCallback } from 'react';
import { Server, Plus, Trash2, RefreshCw, Loader2, Check, Copy, AlertCircle } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Badge, Input, Label } from '@keyshield/ui';
import { ConfirmButton } from '../components/ui/ConfirmButton';
import { apiFetch } from '@keyshield/shared/api';

interface EphemeralWallet {
  agent_id: string;
  pubkey: string;
}

export default function EphemeralWallets() {
  const [wallets, setWallets] = useState<EphemeralWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentIdInput, setAgentIdInput] = useState('');
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [created, setCreated] = useState<EphemeralWallet | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/agents/wallets');
      if (res.ok) {
        const data = await res.json();
        setWallets(data.wallets ?? []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    const id = agentIdInput.trim();
    if (!id) return;
    setCreating(true); setErr(''); setCreated(null);
    try {
      const res = await apiFetch(`/agents/${encodeURIComponent(id)}/wallet/create`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.detail ?? 'Failed to create wallet'); return; }
      setCreated({ agent_id: data.agent_id, pubkey: data.pubkey });
      setAgentIdInput('');
      load();
    } catch { setErr('Network error'); }
    finally { setCreating(false); }
  };

  const handleRevoke = async (agentId: string) => {
    setRevokingId(agentId);
    try {
      await apiFetch(`/agents/${encodeURIComponent(agentId)}/wallet/revoke`, {
        method: 'DELETE',
      });
      load();
    } catch { /* ignore */ }
    finally { setRevokingId(null); }
  };

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" style={{ color: '#f8f8f8' }} /></div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ color: '#f8f8f8' }}>Ephemeral Wallets</h1>
          <p className="page-header-subtitle">One-time wallets for agent transactions</p>
        </div>
      </div>

      {/* Create form */}
      <Card className="border-[#0f0f0f] shadow-sm bg-[#080808] mb-6">
        <CardHeader><CardTitle style={{ color: '#f8f8f8' }}>Create Ephemeral Wallet</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Label className="text-xs uppercase tracking-wider text-[#666]">Agent ID</Label>
              <Input value={agentIdInput} onChange={e => setAgentIdInput(e.target.value)} placeholder="agent_..." className="bg-[#0a0a0a] border-[#141414] text-white" />
            </div>
            <Button size="sm" onClick={handleCreate} disabled={creating || !agentIdInput.trim()}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}
              Create
            </Button>
          </div>
          {err && (
            <div className="flex items-center gap-2 mt-3 p-3 rounded-lg bg-[#1a0808] border border-[#3b2020]">
              <AlertCircle size={14} style={{ color: '#f8f8f8' }} />
              <p className="text-sm" style={{ color: '#f8f8f8' }}>{err}</p>
            </div>
          )}
          {created && (
            <div className="mt-3 p-3 rounded-lg bg-[#080808] border" style={{ borderColor: '#141414' }}>
              <p className="text-xs mb-1" style={{ color: '#f8f8f8' }}>Created wallet:</p>
              <div className="flex items-center gap-2">
                <code className="text-sm font-mono" style={{ color: '#f8f8f8' }}>{created.pubkey}</code>
                <Button variant="ghost" size="icon" onClick={() => navigator.clipboard.writeText(created.pubkey)}>
                  <Copy size={14} style={{ color: '#f8f8f8' }} />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Wallets list */}
      <Card className="border-[#0f0f0f] shadow-sm bg-[#080808]">
        <CardHeader><CardTitle style={{ color: '#f8f8f8' }}>Wallets ({wallets.length})</CardTitle></CardHeader>
        <CardContent>
          {wallets.length === 0 ? (
            <div className="py-12 text-center">
              <Server className="h-10 w-10 mx-auto mb-3" style={{ color: '#f8f8f8' }} />
              <p className="text-sm" style={{ color: '#f8f8f8' }}>No ephemeral wallets</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#f8f8f8' }}>Agent ID</TableHead>
                  <TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#f8f8f8' }}>Pubkey</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {wallets.map(w => (
                  <TableRow key={w.agent_id}>
                    <TableCell className="font-mono text-xs" style={{ color: '#f8f8f8' }}>{w.agent_id.slice(0, 12)}...</TableCell>
                    <TableCell className="font-mono text-xs" style={{ color: '#f8f8f8' }}>{w.pubkey.slice(0, 16)}...</TableCell>
                    <TableCell>
                      <ConfirmButton onConfirm={() => handleRevoke(w.agent_id)} confirmLabel="REVOKE">
                        <Trash2 className="h-4 w-4" style={{ color: '#f8f8f8' }} />
                      </ConfirmButton>
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
