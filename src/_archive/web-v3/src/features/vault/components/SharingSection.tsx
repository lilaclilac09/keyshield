import React, { useState } from 'react';
import { Card, StatCard } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { DataTable, type Column } from '../../../components/ui/DataTable';
import { apiFetch } from '../../../lib/auth';

export const SharingSection: React.FC<{ addr: string }> = ({ addr }) => {
  const [incoming, setIncoming] = useState<number>(0);
  const [outgoing, setOutgoing] = useState<number>(0);

  return (
    <div className="space-y-6">
      <Card title="Key Sharing" description="Re-encrypted access for authorized recipients">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <StatCard label="Received" value={incoming} hint="keys shared with you" />
          <StatCard label="Sent" value={outgoing} hint="keys you shared" />
          <StatCard label="Your Address" value={addr.slice(0, 8) + '…'} hint="wallet address" />
        </div>
        <p className="text-[12px] text-zinc-400">Sharing requires re-encryption with recipient's public key. Keys are stored encrypted in the vault and decrypted on-demand.</p>
      </Card>
    </div>
  );
};
