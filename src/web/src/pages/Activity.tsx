import { useState } from 'react';
import { TrendingUp, RefreshCw, Zap, Activity as ActivityIcon, ArrowUpRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tabs, TabsContent, TabsList, TabsTrigger, Badge, Button, Skeleton } from '@keyshield/ui';
import { StatCard } from '../components/ui/StatCard';
import { useBilling } from '@keyshield/shared/hooks/use-billing';
import { useMpp } from '@keyshield/shared/hooks/use-mpp';
import { relTime } from '@keyshield/shared/lib/time';

const PROVIDER_META: Record<string, { name: string; color: string }> = {
  openai: { name: 'OpenAI', color: '#10b981' },
  anthropic: { name: 'Anthropic', color: '#d4a373' },
  groq: { name: 'Groq', color: '#f59e0b' },
  helius: { name: 'Helius', color: '#6366f1' },
};

function ProviderBadge({ upstream }: { upstream: string }) {
  const meta = PROVIDER_META[upstream] ?? { name: upstream, color: '#8e8e9a' };
  return <Badge variant="secondary" style={{ background: `${meta.color}15`, color: meta.color, borderColor: `${meta.color}30` }}>{meta.name}</Badge>;
}

export default function Activity() {
  const { info, isLoading: billingLoading } = useBilling();
  const { streams, isLoading: mppLoading } = useMpp();
  const [tab, setTab] = useState('overview');

  if (billingLoading || mppLoading) return (
    <div>
      <div className="stat-card-grid">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl bg-[#111]" />)}</div>
      <Skeleton className="h-64 rounded-xl bg-[#111]" />
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Activity</h1>
          <p className="page-header-subtitle">Billing, usage, and MPP stream overview</p>
        </div>
      </div>

      {info && (
        <div className="stat-card-grid">
          <StatCard label="Balance (SOL)" value={info.balance_sol.toFixed(4)} hint="on-chain" />
          <StatCard label="Balance (USD)" value={`$${info.balance_usd.toFixed(2)}`} />
          <StatCard label="Total Spent" value={`$${info.total_spent_usd.toFixed(2)}`} hint="lifetime" />
          <StatCard label="Keys Proxied" value={info.total_keys_proxied.toLocaleString()} hint="total calls" />
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="streams">MPP Streams</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="ks-card">
            <div className="ks-card-header">
              <div className="ks-card-title">Recent Activity</div>
            </div>
            <div className="ks-card-content">
              <div className="empty-state" style={{ padding: '48px 24px', border: 'none', background: 'transparent' }}>
                <div className="empty-state-icon">
                  <ActivityIcon className="h-5 w-5" color="#4a4a56" />
                </div>
                <p style={{ color: '#6b6b7a', fontSize: '13px' }}>Activity feed will show recent proxy calls, MPP settlements, and billing events.</p>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="streams">
          <div className="ks-card">
            <div className="ks-card-header">
              <div className="ks-card-title">MPP Streams</div>
            </div>
            <div className="ks-card-content">
              {streams.length === 0 ? (
                <div className="empty-state" style={{ padding: '48px 24px', border: 'none', background: 'transparent' }}>
                  <div className="empty-state-icon">
                    <Zap className="h-5 w-5" style={{ color: '#4a4a56' }} />
                  </div>
                  <h3>No active MPP streams</h3>
                  <p>Open a stream to enable micro-payments for agent API calls</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Agent</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Deposited</TableHead>
                      <TableHead>Usage</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {streams.map(s => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium text-white">{s.name}</TableCell>
                        <TableCell className="font-mono text-xs" style={{ color: '#6b6b7a' }}>{s.agent_id?.slice(0, 12)}...</TableCell>
                        <TableCell>
                          <Badge variant={s.status === 'active' ? 'success' : 'secondary'}>{s.status}</Badge>
                        </TableCell>
                        <TableCell>{s.total_deposited_sol.toFixed(4)} SOL</TableCell>
                        <TableCell>${s.total_usage_usd.toFixed(2)}</TableCell>
                        <TableCell style={{ color: '#6b6b7a' }}>{relTime(new Date(s.created_at).getTime() / 1000)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="usage">
          <div className="ks-card">
            <div className="ks-card-header">
              <div className="ks-card-title">Usage History</div>
            </div>
            <div className="ks-card-content">
              <p style={{ color: '#6b6b7a', fontSize: '13px' }}>Detailed usage logs will show per-call tokens, latency, and cost.</p>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
