import { useState } from 'react';
import { Activity as ActivityIcon, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tabs, TabsContent, TabsList, TabsTrigger, Skeleton } from '@keyshield/ui';
import { StatCard } from '../components/ui/StatCard';
import { useBilling } from '@keyshield/shared/hooks/use-billing';
import { useMpp } from '@keyshield/shared/hooks/use-mpp';
import { relTime } from '@keyshield/shared/lib/time';

export default function Activity() {
  const { info, isLoading: billingLoading } = useBilling();
  const { streams, isLoading: mppLoading } = useMpp();
  const [tab, setTab] = useState('overview');

  if (billingLoading || mppLoading) return <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ color: '#707070' }}>Activity</h1>
          <p className="page-header-subtitle">Real-time vault activity and payment streams</p>
        </div>
      </div>

      {info && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard label="Balance (SOL)" value={info.balance_sol.toFixed(4)} />
          <StatCard label="Balance (USD)" value={`$${info.balance_usd.toFixed(2)}`} />
          <StatCard label="Total Spent" value={`$${info.total_spent_usd.toFixed(2)}`} />
          <StatCard label="Keys Proxied" value={info.total_keys_proxied.toLocaleString()} />
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
            <CardHeader><CardTitle style={{ color: '#707070' }}>Recent Activity</CardTitle></CardHeader>
            <CardContent><p className="text-sm" style={{ color: '#505050' }}>Activity feed coming from API...</p></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="streams">
          <Card className="border-[#0f0f0f] shadow-sm bg-[#080808]">
            <CardHeader><CardTitle style={{ color: '#707070' }}>MPP Streams</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#808080' }}>Name</TableHead>
                    <TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#808080' }}>Status</TableHead>
                    <TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#808080' }}>Deposited</TableHead>
                    <TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#808080' }}>Usage</TableHead>
                    <TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#808080' }}>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {streams.map(s => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium" style={{ color: '#707070' }}>{s.name}</TableCell>
                      <TableCell><span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${s.status === 'active' ? 'bg-[#ecfdf3] text-[#0f7b41]' : 'bg-[#0a0a0a] text-[#8e8e9a]'}`}>{s.status}</span></TableCell>
                      <TableCell style={{ color: '#606060' }}>{s.total_deposited_sol.toFixed(4)} SOL</TableCell>
                      <TableCell style={{ color: '#606060' }}>${s.total_usage_usd.toFixed(2)}</TableCell>
                      <TableCell style={{ color: '#505050' }}>{relTime(s.created_at)}</TableCell>
                    </TableRow>
                  ))}
                  {streams.length === 0 && <TableRow><TableCell colSpan={5} className="text-center" style={{ color: '#505050' }}>No streams</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usage">
          <Card className="border-[#0f0f0f] shadow-sm bg-[#080808]">
            <CardHeader><CardTitle style={{ color: '#707070' }}>Usage History</CardTitle></CardHeader>
            <CardContent><p className="text-sm" style={{ color: '#505050' }}>Usage details coming from API...</p></CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
