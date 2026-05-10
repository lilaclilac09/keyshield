import { useState } from 'react';
import { Shield, Key, Bell, Eye } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, CardDescription, Switch, Label, Input, Separator, Tabs, TabsContent, TabsList, TabsTrigger } from '@keyshield/ui';
import { usePreferencesStore, useAuthStore } from '@keyshield/shared/stores';
import { clearAuth } from '@keyshield/shared/auth';
import { useNavigate } from 'react-router';

export default function Settings() {
  const navigate = useNavigate();
  const { logout } = useAuthStore();
  const { reveal_duration_sec, default_expiry_days, notify_on_expiry, notify_on_anomaly, sidebar_collapsed, setPref } = usePreferencesStore();
  const [passkeyRegistered, setPasskeyRegistered] = useState(false);

  function handleLogout() {
    clearAuth();
    logout();
    navigate('/login');
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ color: '#707070' }}>Settings</h1>
          <p className="page-header-subtitle">Configure your KeyShield dashboard</p>
        </div>
      </div>

      <Tabs defaultValue="general">
        <TabsList className="mb-6">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card className="border-[#0f0f0f] shadow-sm bg-[#080808]">
            <CardHeader><CardTitle style={{ color: '#707070' }}>General Settings</CardTitle><CardDescription>Configure your dashboard preferences</CardDescription></CardHeader>
            <CardContent className="space-y-0">
              <div className="flex items-center justify-between py-4 border-b" style={{ borderBottomColor: '#0f0f0f' }}>
                <div><Label>Collapsed Sidebar</Label><p className="text-xs mt-1" style={{ color: '#505050' }}>Start with sidebar collapsed</p></div>
                <Switch checked={sidebar_collapsed} onCheckedChange={v => setPref('sidebar_collapsed', v)} />
              </div>
              <div className="flex items-center justify-between py-4 border-b" style={{ borderBottomColor: '#0f0f0f' }}>
                <div><Label>Reveal Duration</Label><p className="text-xs mt-1" style={{ color: '#505050' }}>Seconds to show decrypted key values</p></div>
                <Input type="number" className="w-20 bg-[#0a0a0a] border-[#141414] text-white" value={reveal_duration_sec} onChange={e => setPref('reveal_duration_sec', Number(e.target.value))} min={5} max={120} />
              </div>
              <div className="flex items-center justify-between py-4">
                <div><Label>Default Expiry</Label><p className="text-xs mt-1" style={{ color: '#505050' }}>Default days for new vault items</p></div>
                <Input type="number" className="w-20 bg-[#0a0a0a] border-[#141414] text-white" value={default_expiry_days} onChange={e => setPref('default_expiry_days', Number(e.target.value))} min={1} max={365} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card className="border-[#0f0f0f] shadow-sm bg-[#080808]">
            <CardHeader><CardTitle style={{ color: '#707070' }}>Security</CardTitle><CardDescription>Manage authentication and access</CardDescription></CardHeader>
            <CardContent className="space-y-0">
              <div className="flex items-center justify-between py-4 border-b" style={{ borderBottomColor: '#0f0f0f' }}>
                <div><Label>Passkey Authentication</Label><p className="text-xs mt-1" style={{ color: '#505050' }}>Register a passkey for passwordless login</p></div>
                <Button variant={passkeyRegistered ? 'secondary' : 'primary'} size="sm">
                  {passkeyRegistered ? 'Registered' : 'Register'}
                </Button>
              </div>
              <div className="flex items-center justify-between py-4">
                <div><Label>Sign Out</Label><p className="text-xs mt-1" style={{ color: '#505050' }}>End your current session</p></div>
                <Button variant="destructive" size="sm" onClick={handleLogout}>Sign Out</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card className="border-[#0f0f0f] shadow-sm bg-[#080808]">
            <CardHeader><CardTitle style={{ color: '#707070' }}>Notifications</CardTitle><CardDescription>Configure notification preferences</CardDescription></CardHeader>
            <CardContent className="space-y-0">
              <div className="flex items-center justify-between py-4 border-b" style={{ borderBottomColor: '#0f0f0f' }}>
                <div><Label>Expiry Notifications</Label><p className="text-xs mt-1" style={{ color: '#505050' }}>Get notified when keys are about to expire</p></div>
                <Switch checked={notify_on_expiry} onCheckedChange={v => setPref('notify_on_expiry', v)} />
              </div>
              <div className="flex items-center justify-between py-4">
                <div><Label>Anomaly Detection</Label><p className="text-xs mt-1" style={{ color: '#505050' }}>Alert on unusual access patterns</p></div>
                <Switch checked={notify_on_anomaly} onCheckedChange={v => setPref('notify_on_anomaly', v)} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
