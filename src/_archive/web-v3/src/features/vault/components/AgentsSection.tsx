import React, { useState, useEffect, useCallback } from 'react';
import { Bot, Plus, RefreshCw, AlertCircle } from 'lucide-react';
import { Card, StatCard } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Input } from '../../../components/ui/Input';
import { apiFetch } from '../../../lib/auth';

interface AgentInfo {
  id: string;
  name: string;
  status: string;
  last_seen: number;
}

export const AgentsSection: React.FC = () => {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await apiFetch('/agents');
      if (res.ok) {
        const data = await res.json();
        setAgents(data.agents ?? []);
      }
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  return (
    <div className="space-y-6">
      <Card title="Agent Registry" description="ed25519 agent identities and embedded wallets">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[12px] text-zinc-400">{agents.length} agents registered</span>
          <Button variant="primary" size="sm" onClick={fetchAgents} loading={loading}>
            {loading ? 'Refreshing...' : <><RefreshCw size={12} /> Refresh</>}
          </Button>
        </div>
        {agents.length === 0 ? (
          <div className="text-center py-8 text-zinc-500">No agents registered yet. Add an agent via the Developer panel.</div>
        ) : (
          <div className="space-y-2">
            {agents.map(a => (
              <div key={a.id} className="flex items-center gap-4 px-3 py-2 rounded-[2px] bg-[#050505] border border-zinc-800">
                <Bot size={16} className="text-white shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-white font-medium truncate">{a.name}</p>
                  <p className="text-[11px] text-zinc-500 font-mono">{a.id.slice(0, 16)}…</p>
                </div>
                <Badge variant={a.status === 'online' ? 'success' : 'neutral'}>{a.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};
