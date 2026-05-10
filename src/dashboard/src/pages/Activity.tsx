import { useState } from 'react';
import { TrendingUp, RefreshCw, Loader2, Zap, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tabs, TabsContent, TabsList, TabsTrigger, Badge, Button, Skeleton, Input } from '@keyshield/ui';
import { StatCard } from '../components/ui/StatCard';
import { useBilling } from '@keyshield/shared/hooks/use-billing';
import { useMpp } from '@keyshield/shared/hooks/use-mpp';
import { relTime } from '@keyshield/shared/lib/time';

const PROVIDER_META: Record<string, { name: string; color: string }> = {
  openai: { name: 'OpenAI', color: '#10a37f' },
  anthropic: { name: 'Anthropic', color: '#d4a373' },
  groq: { name: 'Groq', color: '#f59e0b' },
  helius: { name: 'Helius', color: '#6366f1' },
};

function ProviderBadge({ upstream }: { upstream: string }) {
  const meta = PROVIDER_META[upstream] ?? { name: upstream, color: '#c4c4d0' };
  return <Badge variant="secondary" style={{ background: `${meta.color}15`, color: meta.color, borderColor: `${meta.color}30` }}>{meta.name}</Badge>;
}

export default function Activity() {
  const { info, isLoading: billingLoading } = useBilling();
  const { streams, isLoading: mppLoading } = useMpp();
  const [tab, setTab] = useState('overview');

  if (billingLoading || mppLoading) return <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ color: '#f8f8f8' }}>Activity</h1>
          <p className="page-header-subtitle">Real-time vault usage, billing, and MPP payment streams</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => window.location.reload()}>
          <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
        </Button>
      </div>

      {info && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
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
          <Card className="border-[#0f0f0f] shadow-sm bg-[#080808]">
            <CardHeader><CardTitle style={{ color: '#f8f8f8' }}>Recent Activity</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm" style={{ color: '#c4c4d0' }}>Activity feed will show recent proxy calls, MPP settlements, and billing events.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="streams">
          <Card className="border-[#0f0f0f] shadow-sm bg-[#080808]">
            <CardHeader><CardTitle style={{ color: '#f8f8f8' }}>MPP Streams</CardTitle></CardHeader>
            <CardContent>
              {streams.length === 0 ? (
                <div className="py-12 text-center">
                  <Zap className="h-8 w-8 mx-auto mb-3" style={{ color: '#666' }} />
                  <p className="text-sm" style={{ color: '#c4c4d0' }}>No active MPP streams</p>
                  <p className="text-xs mt-1" style={{ color: '#a0a0b0' }}>Open a stream to enable micro-payments for agent API calls</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#888' }}>Name</TableHead>
                      <TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#888' }}>Agent</TableHead>
                      <TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#888' }}>Status</TableHead>
                      <TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#888' }}>Deposited</TableHead>
                      <TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#888' }}>Usage</TableHead>
                      <TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#888' }}>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {streams.map(s => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium" style={{ color: '#e0e0e0' }}>{s.name}</TableCell>
                        <TableCell className="font-mono text-xs" style={{ color: '#888' }}>{s.agent_id?.slice(0, 12)}...</TableCell>
                        <TableCell>
                          <Badge variant={s.status === 'active' ? 'success' : 'secondary'}>{s.status}</Badge>
                        </TableCell>
                        <TableCell style={{ color: '#c4c4d0' }}>{s.total_deposited_sol.toFixed(4)} SOL</TableCell>
                        <TableCell style={{ color: '#c4c4d0' }}>${s.total_usage_usd.toFixed(2)}</TableCell>
                        <TableCell style={{ color: '#c4c4d0' }}>{relTime(new Date(s.created_at).getTime() / 1000)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usage">
          <Card className="border-[#0f0f0f] shadow-sm bg-[#080808]">
            <CardHeader><CardTitle style={{ color: '#f8f8f8' }}>Usage History</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm" style={{ color: '#c4c4d0' }}>Detailed usage logs will show per-call tokens, latency, and cost.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
