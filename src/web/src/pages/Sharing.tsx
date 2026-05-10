import { useState, useCallback } from 'react';
import { Share2, Plus, ArrowDownLeft, ArrowUpRight, X, RefreshCw } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Badge, Skeleton, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Input, Label, Tabs, TabsContent, TabsList, TabsTrigger } from '@keyshield/ui';
import { useSharing } from '@keyshield/shared/hooks/use-sharing';
import { relTime } from '@keyshield/shared/lib/time';

export default function Sharing() {
  const { incoming, outgoing, isLoading, grant, revoke, refetch } = useSharing();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [grantee, setGrantee] = useState('');
  const [keyId, setKeyId] = useState('');
  const [revokingId, setRevokingId] = useState<string | null>(null);

  async function handleGrant() {
    if (!grantee.trim() || !keyId.trim()) return;
    await grant({ vault_key_id: keyId, grantee_address: grantee.trim() });
    setGrantee('');
    setKeyId('');
    setDialogOpen(false);
  }

  async function handleRevoke(id: string) {
    setRevokingId(id);
    try { await revoke(id); } finally { setRevokingId(null); }
  }

  if (isLoading) return <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ color: '#707070' }}>Sharing</h1>
          <p className="page-header-subtitle">Vault key access grants and delegation</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => refetch?.()}>
            <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Share Key
          </Button>
        </div>
      </div>

      <Tabs defaultValue="incoming">
        <TabsList className="mb-6">
          <TabsTrigger value="incoming">Incoming ({incoming.length})</TabsTrigger>
          <TabsTrigger value="outgoing">Outgoing ({outgoing.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="incoming">
          <Card className="border-[#0f0f0f] shadow-sm bg-[#080808]">
            <CardContent className="pt-6">
              {incoming.length === 0 ? (
                <div className="py-12 text-center">
                  <ArrowDownLeft className="h-8 w-8 mx-auto mb-3" style={{ color: '#333' }} />
                  <p className="text-sm" style={{ color: '#333' }}>No incoming shares</p>
                </div>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#4a4a4a' }}>Key ID</TableHead><TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#4a4a4a' }}>Granted By</TableHead><TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#4a4a4a' }}>Expires</TableHead><TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#4a4a4a' }}>Status</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {incoming.map(s => (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono text-xs" style={{ color: '#4a4a4a' }}>{s.vault_key_id?.slice(0, 12) ?? s.id.slice(0, 12)}...</TableCell>
                        <TableCell className="font-mono text-xs" style={{ color: '#4a4a4a' }}>{s.grantee_address?.slice(0, 8) ?? '...'}...</TableCell>
                        <TableCell style={{ color: '#333' }}>{s.expires_at ? relTime(new Date(s.expires_at).getTime() / 1000) : 'Never'}</TableCell>
                        <TableCell><Badge variant={s.is_active ? 'success' : 'secondary'}>{s.is_active ? 'Active' : 'Revoked'}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="outgoing">
          <Card className="border-[#0f0f0f] shadow-sm bg-[#080808]">
            <CardContent className="pt-6">
              {outgoing.length === 0 ? (
                <div className="py-12 text-center">
                  <ArrowUpRight className="h-8 w-8 mx-auto mb-3" style={{ color: '#333' }} />
                  <p className="text-sm" style={{ color: '#333' }}>No outgoing shares</p>
                </div>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#4a4a4a' }}>Key ID</TableHead><TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#4a4a4a' }}>Grantee</TableHead><TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#4a4a4a' }}>Expires</TableHead><TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#4a4a4a' }}>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
                  <TableBody>
                    {outgoing.map(s => (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono text-xs" style={{ color: '#4a4a4a' }}>{s.vault_key_id?.slice(0, 12) ?? s.id.slice(0, 12)}...</TableCell>
                        <TableCell className="font-mono text-xs" style={{ color: '#4a4a4a' }}>{s.grantee_address?.slice(0, 8) ?? '...'}...</TableCell>
                        <TableCell style={{ color: '#333' }}>{s.expires_at ? relTime(new Date(s.expires_at).getTime() / 1000) : 'Never'}</TableCell>
                        <TableCell><Badge variant={s.is_active ? 'success' : 'secondary'}>{s.is_active ? 'Active' : 'Revoked'}</Badge></TableCell>
                        <TableCell>
                          {s.is_active && (
                            <Button variant="ghost" size="icon" onClick={() => handleRevoke(s.id)} disabled={revokingId === s.id}>
                              <X className="h-4 w-4" style={{ color: '#c62232' }} />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-[#080808] border-[#141414]">
          <DialogHeader><DialogTitle style={{ color: '#707070' }}>Share Vault Key</DialogTitle><DialogDescription>Grant access to a specific vault item</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <div><Label>Vault Key ID</Label><Input value={keyId} onChange={e => setKeyId(e.target.value)} placeholder="key_..." className="bg-[#0a0a0a] border-[#141414] text-white" /></div>
            <div><Label>Grantee Wallet Address</Label><Input value={grantee} onChange={e => setGrantee(e.target.value)} placeholder="wallet address" className="bg-[#0a0a0a] border-[#141414] text-white" /></div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleGrant} disabled={!grantee.trim() || !keyId.trim()}>Share</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
