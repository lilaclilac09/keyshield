import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { apiFetch } from '../../../lib/auth';

interface EphemeralWallet { agent_id: string; pubkey: string; }

export const EphemeralWalletsSection: React.FC = () => {
  const [wallets, setWallets] = useState<EphemeralWallet[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWallets = useCallback(async () => {
    try {
      const res = await apiFetch('/ephemeral-wallets');
      if (res.ok) {
        const data = await res.json();
        setWallets(data.wallets ?? []);
      }
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchWallets(); }, [fetchWallets]);

  return (
    <div className="space-y-6">
      <Card title="Ephemeral Wallets" description="Embedded wallets for authorized agents">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[12px] text-zinc-400">{wallets.length} wallets</span>
          <Button variant="primary" size="sm" onClick={fetchWallets}>Refresh</Button>
        </div>
        {wallets.length === 0 ? (
          <div className="text-center py-8 text-zinc-500">No ephemeral wallets registered yet.</div>
        ) : (
          <div className="space-y-2">
            {wallets.map(w => (
              <div key={w.pubkey} className="flex items-center gap-4 px-3 py-2 rounded-[2px] bg-[#050505] border border-zinc-800">
                <span className="text-[11px] text-white font-mono truncate">{w.pubkey}</span>
                <span className="text-[11px] text-zinc-500">{w.agent_id.slice(0, 12)}…</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};
