import { useState, useCallback } from 'react';
import { Shield, Key, Bell, Eye, Trash2, Check, Loader2, ExternalLink, Fingerprint, Zap, Download } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, CardDescription, Switch, Label, Input, Tabs, TabsContent, TabsList, TabsTrigger, Skeleton } from '@keyshield/ui';
import { AuditRetentionSettings } from '../components/AuditRetentionSettings';
import { usePreferencesStore } from '@keyshield/shared/stores';
import { clearAuth } from '@keyshield/shared/auth';
import { useNavigate } from 'react-router';
import { VERSION, BUILD_DATE, BETA_FEEDBACK_URL } from '@keyshield/shared/lib/version';

export default function Settings() {
  const navigate = useNavigate();
  const prefs = usePreferencesStore();
  const [passkeyRegistered, setPasskeyRegistered] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [registeringPasskey, setRegisteringPasskey] = useState(false);

  const handleLogout = useCallback(() => {
    clearAuth();
    navigate('/login');
  }, [navigate]);

  const setPref = (key: string, value: any) => {
    // Update via zustand store
    prefs.setPreferences?.({ [key]: value });
  };

  const { reveal_duration_sec, default_expiry_days, notify_on_expiry, notify_on_anomaly, sidebar_collapsed } = prefs.preferences ?? {};

  const handleDeleteAccount = async () => {
    if (deleteText !== 'DELETE my account') return;
    setDeleting(true);
    try {
      // Call delete account API
      clearAuth();
      navigate('/login');
    } catch (e) {
      console.error('Delete account failed:', e);
    }
    setDeleting(false);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ color: '#f8f8f8' }}>Settings</h1>
          <p className="page-header-subtitle">Configure your dashboard preferences and security</p>
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: '#c4c4d0' }}>
          <span>KeyShield {VERSION}</span>
          <span>·</span>
          <span>built {BUILD_DATE}</span>
          <a href={BETA_FEEDBACK_URL} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[#a5b4fc] hover:text-white transition-colors">
            Feedback <ExternalLink size={10} />
          </a>
        </div>
      </div>

      <Tabs defaultValue="general">
        <TabsList className="mb-6">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="danger">Danger Zone</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card className="border-[#0f0f0f] shadow-sm bg-[#080808]">
            <CardHeader><CardTitle style={{ color: '#f8f8f8' }}>General Settings</CardTitle><CardDescription>Configure your dashboard preferences</CardDescription></CardHeader>
            <CardContent className="space-y-0">
              <div className="flex items-center justify-between py-4 border-b" style={{ borderBottomColor: '#0f0f0f' }}>
                <div><Label>Collapsed Sidebar</Label><p className="text-xs mt-1" style={{ color: '#c4c4d0' }}>Start with sidebar collapsed</p></div>
                <Switch checked={sidebar_collapsed ?? false} onCheckedChange={v => setPref('sidebar_collapsed', v)} />
              </div>
              <div className="flex items-center justify-between py-4 border-b" style={{ borderBottomColor: '#0f0f0f' }}>
                <div><Label>Reveal Duration</Label><p className="text-xs mt-1" style={{ color: '#c4c4d0' }}>Seconds to show decrypted key values</p></div>
                <Input type="number" className="w-20 bg-[#0a0a0a] border-[#141414] text-white" value={reveal_duration_sec ?? 30} onChange={e => setPref('reveal_duration_sec', Number(e.target.value))} min={5} max={120} />
              </div>
              <div className="flex items-center justify-between py-4">
                <div><Label>Default Expiry</Label><p className="text-xs mt-1" style={{ color: '#c4c4d0' }}>Default days for new vault items</p></div>
                <Input type="number" className="w-20 bg-[#0a0a0a] border-[#141414] text-white" value={default_expiry_days ?? 30} onChange={e => setPref('default_expiry_days', Number(e.target.value))} min={1} max={365} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card className="border-[#0f0f0f] shadow-sm bg-[#080808]">
            <CardHeader><CardTitle style={{ color: '#f8f8f8' }}>Security</CardTitle><CardDescription>Manage authentication and access</CardDescription></CardHeader>
            <CardContent className="space-y-0">
              <div className="flex items-center justify-between py-4 border-b" style={{ borderBottomColor: '#0f0f0f' }}>
                <div className="flex items-center gap-3">
                  <Fingerprint size={20} style={{ color: '#6366f1' }} />
                  <div><Label>Passkey Authentication</Label><p className="text-xs mt-1" style={{ color: '#c4c4d0' }}>Register a passkey for passwordless login</p></div>
                </div>
                <Button variant={passkeyRegistered ? 'secondary' : 'primary'} size="sm" disabled={registeringPasskey} onClick={() => setPasskeyRegistered(true)}>
                  {registeringPasskey ? <Loader2 className="h-4 w-4 animate-spin" /> : passkeyRegistered ? <><Check className="h-4 w-4 mr-1.5" /> Registered</> : 'Register'}
                </Button>
              </div>
              <div className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <Zap size={20} style={{ color: '#f59e0b' }} />
                  <div><Label>Sign Out</Label><p className="text-xs mt-1" style={{ color: '#c4c4d0' }}>End your current session</p></div>
                </div>
                <Button variant="destructive" size="sm" onClick={handleLogout}>Sign Out</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <AuditRetentionSettings />
        </TabsContent>

        <TabsContent value="notifications">
          <Card className="border-[#0f0f0f] shadow-sm bg-[#080808]">
            <CardHeader><CardTitle style={{ color: '#f8f8f8' }}>Notifications</CardTitle><CardDescription>Configure notification preferences</CardDescription></CardHeader>
            <CardContent className="space-y-0">
              <div className="flex items-center justify-between py-4 border-b" style={{ borderBottomColor: '#0f0f0f' }}>
                <div className="flex items-center gap-3">
                  {notify_on_expiry ? <Bell size={20} style={{ color: '#34d399' }} /> : <Bell size={20} style={{ color: '#c4c4d0' }} />}
                  <div><Label>Expiry Notifications</Label><p className="text-xs mt-1" style={{ color: '#c4c4d0' }}>Get notified when keys are about to expire</p></div>
                </div>
                <Switch checked={notify_on_expiry ?? true} onCheckedChange={v => setPref('notify_on_expiry', v)} />
              </div>
              <div className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  {notify_on_anomaly ? <Bell size={20} style={{ color: '#34d399' }} /> : <Bell size={20} style={{ color: '#c4c4d0' }} />}
                  <div><Label>Anomaly Detection</Label><p className="text-xs mt-1" style={{ color: '#c4c4d0' }}>Alert on unusual access patterns</p></div>
                </div>
                <Switch checked={notify_on_anomaly ?? true} onCheckedChange={v => setPref('notify_on_anomaly', v)} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="danger">
          <Card className="border-[#0f0f0f] shadow-sm bg-[#080808]">
            <CardHeader><CardTitle style={{ color: '#f8f8f8' }}>Danger Zone</CardTitle><CardDescription>Irreversible actions</CardDescription></CardHeader>
            <CardContent className="space-y-0">
              <div className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <Trash2 size={20} style={{ color: '#c62232' }} />
                  <div><Label style={{ color: '#f8f8f8' }}>Delete Account</Label><p className="text-xs mt-1" style={{ color: '#c4c4d0' }}>Permanently delete your account and all vault data</p></div>
                </div>
                {!showDeleteConfirm ? (
                  <Button variant="destructive" size="sm" onClick={() => setShowDeleteConfirm(true)}>Delete Account</Button>
                ) : (
                  <div className="flex gap-2">
                    <Input className="w-48 bg-[#0a0a0a] border-[#141414] text-white" value={deleteText} onChange={e => setDeleteText(e.target.value)} placeholder="DELETE my account" />
                    <Button variant="destructive" size="sm" onClick={handleDeleteAccount} disabled={deleting || deleteText !== 'DELETE my account'}>
                      {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { setShowDeleteConfirm(false); setDeleteText(''); }}>Cancel</Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
