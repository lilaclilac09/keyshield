import { useState } from 'react';
import { Share2, Plus, X } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Badge, Skeleton, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Input, Label, Tabs, TabsContent, TabsList, TabsTrigger } from '@keyshield/ui';
import { useSharing } from '@keyshield/shared/hooks/use-sharing';
import { relTime } from '@keyshield/shared/lib/time';

export default function Sharing() {
  const { incoming, outgoing, isLoading, grant, revoke } = useSharing();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [grantee, setGrantee] = useState('');
  const [keyId, setKeyId] = useState('');

  async function handleGrant() {
    if (!grantee.trim() || !keyId.trim()) return;
    await grant({ vault_key_id: keyId, grantee_address: grantee.trim() });
    setGrantee('');
    setKeyId('');
    setDialogOpen(false);
  }

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ color: '#707070' }}>Sharing</h1>
          <p className="page-header-subtitle">Vault key access grants and delegation</p>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" style={{ color: '#808080' }} /> Share Key
        </Button>
      </div>

      <Tabs defaultValue="incoming">
        <TabsList className="mb-6">
          <TabsTrigger value="incoming">Incoming ({incoming.length})</TabsTrigger>
          <TabsTrigger value="outgoing">Outgoing ({outgoing.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="incoming">
          <Card className="border-[#0f0f0f] shadow-sm bg-[#080808]">
            <CardContent className="pt-6">
              <Table>
                <TableHeader><TableRow><TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#808080' }}>Key ID</TableHead><TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#808080' }}>Granted By</TableHead><TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#808080' }}>Expires</TableHead><TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#808080' }}>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {incoming.map(s => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs" style={{ color: '#606060' }}>{s.vault_key_id.slice(0, 12)}...</TableCell>
                      <TableCell className="font-mono text-xs" style={{ color: '#606060' }}>{s.granted_by.slice(0, 8)}...</TableCell>
                      <TableCell style={{ color: '#505050' }}>{s.expires_at ? relTime(s.expires_at) : 'Never'}</TableCell>
                      <TableCell><Badge variant={s.is_active ? 'success' : 'secondary'}>{s.is_active ? 'Active' : 'Revoked'}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {incoming.length === 0 && <TableRow><TableCell colSpan={4} className="text-center" style={{ color: '#505050' }}>No incoming shares</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="outgoing">
          <Card className="border-[#0f0f0f] shadow-sm bg-[#080808]">
            <CardContent className="pt-6">
              <Table>
                <TableHeader><TableRow><TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#808080' }}>Key ID</TableHead><TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#808080' }}>Grantee</TableHead><TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#808080' }}>Expires</TableHead><TableHead className="font-semibold text-xs uppercase tracking-wider" style={{ color: '#808080' }}>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {outgoing.map(s => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs" style={{ color: '#606060' }}>{s.vault_key_id.slice(0, 12)}...</TableCell>
                      <TableCell className="font-mono text-xs" style={{ color: '#606060' }}>{s.grantee_address.slice(0, 8)}...</TableCell>
                      <TableCell style={{ color: '#505050' }}>{s.expires_at ? relTime(s.expires_at) : 'Never'}</TableCell>
                      <TableCell><Badge variant={s.is_active ? 'success' : 'secondary'}>{s.is_active ? 'Active' : 'Revoked'}</Badge></TableCell>
                      <TableCell>
                        {s.is_active && <Button variant="ghost" size="icon" onClick={() => revoke(s.id)}><X className="h-4 w-4" style={{ color: '#606060' }} /></Button>}
                      </TableCell>
                    </TableRow>
                  ))}
                  {outgoing.length === 0 && <TableRow><TableCell colSpan={5} className="text-center" style={{ color: '#505050' }}>No outgoing shares</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-[#080808] border-[#141414]">
          <DialogHeader><DialogTitle style={{ color: '#707070' }}>Share Vault Key</DialogTitle><DialogDescription>Grant access to a specific vault item</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <div><Label>Vault Key ID</Label><Input value={keyId} onChange={e => setKeyId(e.target.value)} placeholder="key_..." /></div>
            <div><Label>Grantee Wallet Address</Label><Input value={grantee} onChange={e => setGrantee(e.target.value)} placeholder="wallet address" /></div>
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
