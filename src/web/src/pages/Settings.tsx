import { useState, useCallback } from 'react';
import { Shield, Key, Bell, Eye, Trash2, Check, Loader2, ExternalLink, Fingerprint, Zap } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle, CardDescription, Switch, Label, Input, Tabs, TabsContent, TabsList, TabsTrigger, Skeleton } from '@keyshield/ui';
import { AuditRetentionSettings } from '../components/AuditRetentionSettings';
import { usePreferencesStore } from '@keyshield/shared/stores';
import { clearAuth } from '@keyshield/shared/auth';
import { useNavigate } from 'react-router';
import { VERSION, BUILD_DATE, BETA_FEEDBACK_URL } from '@keyshield/shared/lib/version';

export default function Settings() {
  const navigate = useNavigate();
  const { setPref, load, ...prefs } = usePreferencesStore();
  const [passkeyRegistered, setPasskeyRegistered] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [registeringPasskey, setRegisteringPasskey] = useState(false);

  const handleLogout = useCallback(() => {
    clearAuth();
    navigate('/login');
  }, [navigate]);

  const {
    reveal_duration_sec,
    default_expiry_days,
    notify_on_expiry,
    notify_on_anomaly,
    sidebar_collapsed,
  } = prefs;

  const handleDeleteAccount = async () => {
    if (deleteText !== 'DELETE my account') return;
    setDeleting(true);
    try {
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
          <h1>Settings</h1>
          <p className="page-header-subtitle">Configure your dashboard preferences</p>
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: '#6b6b7a' }}>
          <span>KeyShield {VERSION}</span>
          <span>\u00B7</span>
          <span>built {BUILD_DATE}</span>
          <a href={BETA_FEEDBACK_URL} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[#6366f1] hover:text-white transition-colors">
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
          <div className="ks-card">
            <div className="ks-card-content" style={{ padding: 0 }}>
              <div className="flex items-center justify-between py-4 px-6 border-b" style={{ borderColor: '#141418' }}>
                <div><Label className="text-white">Collapsed Sidebar</Label><p className="text-xs mt-1" style={{ color: '#6b6b7a' }}>Start with sidebar collapsed</p></div>
                <Switch checked={sidebar_collapsed ?? false} onCheckedChange={v => setPref('sidebar_collapsed', v)} />
              </div>
              <div className="flex items-center justify-between py-4 px-6 border-b" style={{ borderColor: '#141418' }}>
                <div><Label className="text-white">Reveal Duration</Label><p className="text-xs mt-1" style={{ color: '#6b6b7a' }}>Seconds to show decrypted key values</p></div>
                <Input type="number" className="w-20 bg-[#111114] border-[#1e1e24] text-white" value={reveal_duration_sec ?? 30} onChange={e => setPref('reveal_duration_sec', Number(e.target.value))} min={5} max={120} />
              </div>
              <div className="flex items-center justify-between py-4 px-6">
                <div><Label className="text-white">Default Expiry</Label><p className="text-xs mt-1" style={{ color: '#6b6b7a' }}>Default days for new vault items</p></div>
                <Input type="number" className="w-20 bg-[#111114] border-[#1e1e24] text-white" value={default_expiry_days ?? 30} onChange={e => setPref('default_expiry_days', Number(e.target.value))} min={1} max={365} />
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="security">
          <div className="ks-card">
            <div className="ks-card-content" style={{ padding: 0 }}>
              <div className="flex items-center justify-between py-4 px-6 border-b" style={{ borderColor: '#141418' }}>
                <div className="flex items-center gap-3">
                  <Fingerprint size={20} style={{ color: '#6366f1' }} />
                  <div><Label className="text-white">Passkey Authentication</Label><p className="text-xs mt-1" style={{ color: '#6b6b7a' }}>Register a passkey for passwordless login</p></div>
                </div>
                <Button variant={passkeyRegistered ? 'secondary' : 'primary'} size="sm" disabled={registeringPasskey} onClick={() => setPasskeyRegistered(true)}>
                  {registeringPasskey ? <Loader2 className="h-4 w-4 animate-spin" /> : passkeyRegistered ? <><Check className="h-4 w-4 mr-1.5" /> Registered</> : 'Register'}
                </Button>
              </div>
              <div className="flex items-center justify-between py-4 px-6">
                <div className="flex items-center gap-3">
                  <Zap size={20} style={{ color: '#f59e0b' }} />
                  <div><Label className="text-white">Sign Out</Label><p className="text-xs mt-1" style={{ color: '#6b6b7a' }}>End your current session</p></div>
                </div>
                <Button variant="destructive" size="sm" onClick={handleLogout}>Sign Out</Button>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="audit">
          <AuditRetentionSettings />
        </TabsContent>

        <TabsContent value="notifications">
          <div className="ks-card">
            <div className="ks-card-content" style={{ padding: 0 }}>
              <div className="flex items-center justify-between py-4 px-6 border-b" style={{ borderColor: '#141418' }}>
                <div className="flex items-center gap-3">
                  {notify_on_expiry ? <Bell size={20} style={{ color: '#10b981' }} /> : <Bell size={20} style={{ color: '#6b6b7a' }} />}
                  <div><Label className="text-white">Expiry Notifications</Label><p className="text-xs mt-1" style={{ color: '#6b6b7a' }}>Get notified when keys are about to expire</p></div>
                </div>
                <Switch checked={notify_on_expiry ?? true} onCheckedChange={v => setPref('notify_on_expiry', v)} />
              </div>
              <div className="flex items-center justify-between py-4 px-6">
                <div className="flex items-center gap-3">
                  {notify_on_anomaly ? <Bell size={20} style={{ color: '#10b981' }} /> : <Bell size={20} style={{ color: '#6b6b7a' }} />}
                  <div><Label className="text-white">Anomaly Detection</Label><p className="text-xs mt-1" style={{ color: '#6b6b7a' }}>Alert on unusual access patterns</p></div>
                </div>
                <Switch checked={notify_on_anomaly ?? true} onCheckedChange={v => setPref('notify_on_anomaly', v)} />
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="danger">
          <div className="ks-card" style={{ borderColor: 'rgba(239,68,68,0.2)' }}>
            <div className="ks-card-content" style={{ padding: 0 }}>
              <div className="flex items-center justify-between py-4 px-6">
                <div className="flex items-center gap-3">
                  <Trash2 size={20} style={{ color: '#ef4444' }} />
                  <div><Label className="text-white">Delete Account</Label><p className="text-xs mt-1" style={{ color: '#6b6b7a' }}>Permanently delete your account and all vault data</p></div>
                </div>
                {!showDeleteConfirm ? (
                  <Button variant="destructive" size="sm" onClick={() => setShowDeleteConfirm(true)}>Delete Account</Button>
                ) : (
                  <div className="flex gap-2">
                    <Input className="w-48 bg-[#111114] border-[#1e1e24] text-white placeholder:text-[#4a4a56]" value={deleteText} onChange={e => setDeleteText(e.target.value)} placeholder="DELETE my account" />
                    <Button variant="destructive" size="sm" onClick={handleDeleteAccount} disabled={deleting || deleteText !== 'DELETE my account'}>
                      {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { setShowDeleteConfirm(false); setDeleteText(''); }}>Cancel</Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
