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

  if (isLoading) return (
    <div>
      <Skeleton className="h-40 rounded-xl bg-[#111]" />
      <Skeleton className="h-40 rounded-xl bg-[#111] mt-4" />
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Sharing</h1>
          <p className="page-header-subtitle">Share vault keys with other wallets</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => refetch?.()} className="text-[#a0a0b0]">
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
          <div className="ks-card">
            <div className="ks-card-content" style={{ padding: 0 }}>
              {incoming.length === 0 ? (
                <div className="empty-state" style={{ padding: '48px 24px', border: 'none', background: 'transparent' }}>
                  <div className="empty-state-icon">
                    <ArrowDownLeft className="h-5 w-5" style={{ color: '#4a4a56' }} />
                  </div>
                  <h3>No incoming shares</h3>
                </div>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Key ID</TableHead><TableHead>Granted By</TableHead><TableHead>Expires</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {incoming.map(s => (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono text-xs" style={{ color: '#6b6b7a' }}>{s.vault_key_id?.slice(0, 12) ?? s.id.slice(0, 12)}...</TableCell>
                        <TableCell className="font-mono text-xs" style={{ color: '#6b6b7a' }}>{s.grantee_address?.slice(0, 8) ?? '...'}...</TableCell>
                        <TableCell style={{ color: '#6b6b7a' }}>{s.expires_at ? relTime(new Date(s.expires_at).getTime() / 1000) : 'Never'}</TableCell>
                        <TableCell><Badge variant={s.is_active ? 'success' : 'secondary'}>{s.is_active ? 'Active' : 'Revoked'}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="outgoing">
          <div className="ks-card">
            <div className="ks-card-content" style={{ padding: 0 }}>
              {outgoing.length === 0 ? (
                <div className="empty-state" style={{ padding: '48px 24px', border: 'none', background: 'transparent' }}>
                  <div className="empty-state-icon">
                    <ArrowUpRight className="h-5 w-5" style={{ color: '#4a4a56' }} />
                  </div>
                  <h3>No outgoing shares</h3>
                </div>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Key ID</TableHead><TableHead>Grantee</TableHead><TableHead>Expires</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
                  <TableBody>
                    {outgoing.map(s => (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono text-xs" style={{ color: '#6b6b7a' }}>{s.vault_key_id?.slice(0, 12) ?? s.id.slice(0, 12)}...</TableCell>
                        <TableCell className="font-mono text-xs" style={{ color: '#6b6b7a' }}>{s.grantee_address?.slice(0, 8) ?? '...'}...</TableCell>
                        <TableCell style={{ color: '#6b6b7a' }}>{s.expires_at ? relTime(new Date(s.expires_at).getTime() / 1000) : 'Never'}</TableCell>
                        <TableCell><Badge variant={s.is_active ? 'success' : 'secondary'}>{s.is_active ? 'Active' : 'Revoked'}</Badge></TableCell>
                        <TableCell>
                          {s.is_active && (
                            <Button variant="ghost" size="icon" onClick={() => handleRevoke(s.id)} disabled={revokingId === s.id}>
                              <X className="h-4 w-4 text-[#ef4444]" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-[#141418] border-[#1e1e24]">
          <DialogHeader>
            <DialogTitle>Share Vault Key</DialogTitle>
            <DialogDescription>Grant access to a specific vault item</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div><Label className="text-xs uppercase tracking-wider" style={{ color: '#6b6b7a' }}>Vault Key ID</Label><Input value={keyId} onChange={e => setKeyId(e.target.value)} placeholder="key_..." className="bg-[#111114] border-[#1e1e24] text-white placeholder:text-[#4a4a56]" /></div>
            <div><Label className="text-xs uppercase tracking-wider" style={{ color: '#6b6b7a' }}>Grantee Wallet Address</Label><Input value={grantee} onChange={e => setGrantee(e.target.value)} placeholder="wallet address" className="bg-[#111114] border-[#1e1e24] text-white placeholder:text-[#4a4a56]" /></div>
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
