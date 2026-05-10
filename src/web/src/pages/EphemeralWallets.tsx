import { useState, useEffect, useCallback } from 'react';
import { Server, Plus, Trash2, RefreshCw, Loader2, Check, Copy, AlertCircle } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Badge, Input, Label } from '@keyshield/ui';
import { ConfirmButton } from '../components/ui/ConfirmButton';
import { getApiConfig } from '@keyshield/shared/api';
import { getToken } from '@keyshield/shared/auth';

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

  const apiConfig = getApiConfig();

  async function apiCall(path: string, init?: RequestInit) {
    const token = getToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (init?.headers) Object.assign(headers, init.headers);
    const res = await fetch(`${apiConfig.baseUrl}${path}`, { ...init, headers });
    return res;
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiCall('/agents/wallets');
      if (res.ok) {
        const data = await res.json();
        setWallets(data.wallets ?? data ?? []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [apiConfig.baseUrl]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    const id = agentIdInput.trim();
    if (!id) return;
    setCreating(true); setErr(''); setCreated(null);
    try {
      const res = await apiCall(`/agents/${encodeURIComponent(id)}/wallet/create`, {
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
      await apiCall(`/agents/${encodeURIComponent(agentId)}/wallet/revoke`, {
        method: 'DELETE',
      });
      load();
    } catch { /* ignore */ }
    finally { setRevokingId(null); }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="h-6 w-6 animate-spin" style={{ color: '#6366f1' }} />
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Ephemeral Wallets</h1>
          <p className="page-header-subtitle">One-time wallets for agent transactions</p>
        </div>
      </div>

      {/* Create form */}
      <div className="ks-card mb-6">
        <div className="ks-card-header">
          <div className="ks-card-title">Create Ephemeral Wallet</div>
        </div>
        <div className="ks-card-content">
          <div className="flex gap-3 items-end flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs uppercase tracking-wider" style={{ color: '#6b6b7a' }}>Agent ID</Label>
              <Input value={agentIdInput} onChange={e => setAgentIdInput(e.target.value)} placeholder="agent_..." className="bg-[#111114] border-[#1e1e24] text-white placeholder:text-[#4a4a56]" />
            </div>
            <Button size="sm" onClick={handleCreate} disabled={creating || !agentIdInput.trim()}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}
              Create
            </Button>
          </div>
          {err && (
            <div className="flex items-center gap-2 mt-3 p-3 rounded-xl bg-[#1a0808] border border-[#3b2020]">
              <AlertCircle size={14} style={{ color: '#ef4444' }} />
              <p className="text-sm" style={{ color: '#ef4444' }}>{err}</p>
            </div>
          )}
          {created && (
            <div className="mt-3 p-3 rounded-xl bg-[#080808] border" style={{ borderColor: '#141418' }}>
              <p className="text-xs mb-1" style={{ color: '#10b981' }}>Wallet created:</p>
              <div className="flex items-center gap-2">
                <code className="text-sm font-mono" style={{ color: '#e0e0e0' }}>{created.pubkey}</code>
                <Button variant="ghost" size="icon" onClick={() => navigator.clipboard.writeText(created.pubkey)}>
                  <Copy size={14} style={{ color: '#6b6b7a' }} />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Wallets list */}
      <div className="ks-card">
        <div className="ks-card-header">
          <div className="ks-card-title">Wallets ({wallets.length})</div>
        </div>
        <div className="ks-card-content" style={{ padding: 0 }}>
          {wallets.length === 0 ? (
            <div className="empty-state" style={{ padding: '48px 24px', border: 'none', background: 'transparent' }}>
              <div className="empty-state-icon">
                <Server className="h-5 w-5" style={{ color: '#4a4a56' }} />
              </div>
              <h3>No ephemeral wallets</h3>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent ID</TableHead>
                  <TableHead>Pubkey</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {wallets.map(w => (
                  <TableRow key={w.agent_id}>
                    <TableCell className="font-mono text-xs" style={{ color: '#6b6b7a' }}>{w.agent_id.slice(0, 12)}...</TableCell>
                    <TableCell className="font-mono text-xs" style={{ color: '#6b6b7a' }}>{w.pubkey.slice(0, 16)}...</TableCell>
                    <TableCell>
                      <ConfirmButton onConfirm={() => handleRevoke(w.agent_id)} confirmLabel="REVOKE">
                        <Trash2 className="h-4 w-4" style={{ color: '#ef4444' }} />
                      </ConfirmButton>
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
