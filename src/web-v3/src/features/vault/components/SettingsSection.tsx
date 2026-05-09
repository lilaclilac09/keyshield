import React, { useState, useEffect, useCallback } from "react";
import { Key, Fingerprint, RefreshCw, Trash2, Shield, Bell, BellOff } from "lucide-react";
import { Card } from "../../shared/ui/Card";
import { Button } from "../../shared/ui/Button";
import { Toggle } from "../../shared/ui/Toggle";
import { Input } from "../../shared/ui/Input";
import { Badge } from "../../shared/ui/Badge";
import { apiFetch, clearAuth, clearPasskeyTrust, notifyAuthChanged, getPasskeyTrust, registerPasskey, listPasskeys, deletePasskey, setPasskeyTrust } from "../../shared/lib/auth";
import { getPrefs, setPrefs, type VaultPreferences } from "../../shared/lib/preferences";
import { fetchDeleteAccountChallenge, deleteAccount } from "../../shared/lib/api";

const DELETE_CONFIRMATION = 'DELETE my account';

export const SettingsSection: React.FC<{ addr: string }> = ({ addr }) => {
  const [passkeys, setPasskeys] = useState<Array<{ id: string; name: string; createdAt: number }>>([]);
  const [pkLoading, setPkLoading] = useState(false);
  const [pkError, setPkError] = useState('');
  const [pkSuccess, setPkSuccess] = useState('');
  const [newPkName, setNewPkName] = useState('My passkey');
  const [registering, setRegistering] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deviceTrusted, setDeviceTrusted] = useState(() => !!getPasskeyTrust());
  const [prefs, setPrefsState] = useState<VaultPreferences>(() => getPrefs());
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePhrase, setDeletePhrase] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState('');

  const loadPasskeys = useCallback(async () => { setPkLoading(true); setPkError(''); try { const creds = await listPasskeys(); setPasskeys(creds); } catch { setPkError('Failed to load passkeys'); } finally { setPkLoading(false); } }, []);
  useEffect(() => { loadPasskeys(); }, [loadPasskeys]);

  const updatePref = <K extends keyof VaultPreferences>(k: K, v: VaultPreferences[K]) => { setPrefsState(setPrefs({ [k]: v } as Partial<VaultPreferences>)); };

  const handleRegister = async () => { setRegistering(true); setPkError(''); setPkSuccess(''); try { await registerPasskey(newPkName); if (addr) setPasskeyTrust(addr, ''); setDeviceTrusted(true); setPkSuccess('Passkey added. Next time, sign in with Face ID.'); setNewPkName('My passkey'); await loadPasskeys(); } catch (e) { setPkError(e instanceof Error ? e.message : 'Registration failed'); } finally { setRegistering(false); } };
  const handleDelete = async (id: string) => { setDeletingId(id); try { await deletePasskey(id); setPasskeys(prev => prev.filter(p => p.id !== id)); } catch { setPkError('Failed to remove passkey'); } finally { setDeletingId(null); } };
  const handleForgetDevice = () => { clearPasskeyTrust(); setDeviceTrusted(false); setPkSuccess('Device trust cleared on this browser.'); };

  const handleDeleteAccount = async () => { if (deletePhrase !== DELETE_CONFIRMATION) return; setDeleteErr(''); setDeleting(true); try { const ch = await fetchDeleteAccountChallenge(); await deleteAccount({ confirmation: DELETE_CONFIRMATION, challenge: ch.challenge }); clearAuth(); clearPasskeyTrust(); notifyAuthChanged(); location.assign('/'); } catch (e) { setDeleteErr(e instanceof Error ? e.message : 'Account deletion failed'); } finally { setDeleting(false); } };

  return (
    <div className="space-y-4">
      <Card title="Identity" description="Wallet that owns the vault. Recovery = wallet seed phrase.">
        <div className="space-y-2">
          <div className="flex items-center justify-between px-3 py-2 rounded-[2px] bg-[#050505] border border-zinc-800"><span className="text-[11px] text-zinc-500">Wallet</span><code className="text-[12px] font-mono text-zinc-300">{addr || '\u2014'}</code></div>
          <div className="flex items-center justify-between px-3 py-2 rounded-[2px] bg-[#050505] border border-zinc-800"><span className="text-[11px] text-zinc-500">Auth</span><span className="text-[12px] text-zinc-300">Solana ed25519 \xb7 zero-knowledge passphrase</span></div>
          <div className="flex items-center justify-between px-3 py-2 rounded-[2px] bg-[#050505] border border-zinc-800"><span className="text-[11px] text-zinc-500">Encryption</span><span className="text-[12px] text-zinc-300">AES-256-GCM \xb7 PBKDF2-HMAC-SHA256 (100k rounds)</span></div>
        </div>
      </Card>

      <Card title="Trusted Devices" description="Each passkey = one device that can sign in with Face ID / Touch ID / hardware key." headerRight={<button onClick={loadPasskeys} className="text-zinc-500 hover:text-white"><RefreshCw size={13} className={pkLoading ? 'animate-spin' : ''} /></button>}>
        {pkError && <Badge variant="danger">{pkError}</Badge>}
        {pkSuccess && <Badge variant="success">{pkSuccess}</Badge>}
        <div className={`rounded-[2px] border px-3 py-2.5 flex items-center gap-3 mb-3 ${deviceTrusted ? 'border-zinc-700 bg-zinc-900' : 'border-zinc-800 bg-[#050505]'}`}>
          <div className={`w-2 h-2 rounded-full ${deviceTrusted ? 'bg-white' : 'bg-zinc-600'}`} />
          <div className="flex-1"><p className="text-[12px] text-zinc-200">This browser</p><p className="text-[11px] text-zinc-500">{deviceTrusted ? 'Passkey-trusted \u2014 next visit can use Face ID alone' : 'Not trusted yet \u2014 add a passkey below'}</p></div>
          {deviceTrusted && <Button variant="ghost" size="sm" onClick={handleForgetDevice}>Forget</Button>}
        </div>
        {passkeys.map(pk => (
          <div key={pk.id} className="flex items-center gap-3 px-3 py-2.5 rounded-[2px] bg-[#050505] border border-zinc-800 mb-1.5">
            <Fingerprint size={14} className="text-zinc-400 shrink-0" />
            <div className="flex-1 min-w-0"><p className="text-[13px] text-zinc-200 truncate">{pk.name}</p><p className="text-[11px] text-zinc-600 font-mono truncate">{pk.id.slice(0, 24)}\u2026</p></div>
            <span className="text-[10px] text-zinc-600">{new Date(pk.createdAt * 1000).toLocaleDateString()}</span>
            <Button variant="destructive" size="sm" onClick={() => handleDelete(pk.id)} disabled={deletingId === pk.id} loading={deletingId === pk.id}>Delete</Button>
          </div>
        ))}
        {passkeys.length === 0 && !pkLoading && <p className="text-[12px] text-zinc-600 text-center py-2">No passkeys registered yet</p>}
        <div className="flex items-center gap-2 mt-3"><Input label="" value={newPkName} onChange={e => setNewPkName(e.target.value)} placeholder="Device name (e.g. MacBook, iPhone)" /><Button variant="primary" size="md" onClick={handleRegister} disabled={registering || !newPkName.trim()} loading={registering}>Add Passkey</Button></div>
      </Card>

      <Card title="Vault Preferences" description="Control how secrets reveal, expire, and notify. Saved to this browser only.">
        <div className="space-y-3">
          <Toggle label="Notify before expiry" description="Browser notification 7 days before any key expires." checked={prefs.notifyOnExpiry} onChange={v => updatePref('notifyOnExpiry', v)} />
          <Toggle label="Anomaly alerts" description="Notify if a key\'s call rate suddenly spikes 5x." checked={prefs.notifyOnAnomaly} onChange={v => updatePref('notifyOnAnomaly', v)} />
          <div><span className="text-[12px] text-white">Auto-hide reveal after</span><select value={prefs.revealDurationSec} onChange={e => updatePref('revealDurationSec', Number(e.target.value))} className="mt-1 w-full bg-[#050505] border border-zinc-800 rounded-[2px] px-3 py-2 text-[13px] text-white">{[10, 30, 60, 120, 300].map(s => <option key={s} value={s}>{s}s</option>)}</select></div>
        </div>
      </Card>

      <Card title="Danger Zone" description="Irreversible actions.">
        <div className="space-y-3">
          {!deleteOpen ? (
            <Button variant="destructive" size="md" onClick={() => setDeleteOpen(true)}><Trash2 size={12} />Delete Account</Button>
          ) : (
            <div className="space-y-3">
              <Badge variant="danger">This action cannot be undone. All vault items, agents, and sessions will be permanently deleted.</Badge>
              <Input label={`Type "${DELETE_CONFIRMATION}" to confirm`} value={deletePhrase} onChange={e => setDeletePhrase(e.target.value)} placeholder={DELETE_CONFIRMATION} />
              <div className="flex gap-2"><Button variant="destructive" size="md" onClick={handleDeleteAccount} disabled={deletePhrase !== DELETE_CONFIRMATION || deleting} loading={deleting}>Confirm Delete</Button><Button variant="ghost" size="md" onClick={() => setDeleteOpen(false)}>Cancel</Button></div>
              {deleteErr && <p className="text-[12px] text-red-400">{deleteErr}</p>}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};
