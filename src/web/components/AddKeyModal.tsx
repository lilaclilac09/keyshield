import React, { useState, useEffect } from 'react';
import { X, Eye, EyeOff, Key, Lock, FileText, Terminal, KeyRound } from 'lucide-react';
import { VaultItem, VaultItemType, TYPE_PREFIX } from '../types';
import { getPrefs } from '../lib/preferences';

interface Props { isOpen: boolean; onClose: () => void; onSave: (item: Partial<VaultItem> & { upstream?: string; rawKey?: string }) => Promise<void> | void; initialData?: Partial<VaultItem>; }

const PROVIDERS = [
  { id: 'openrouter', name: 'OpenRouter (Nemotron free)', tag: 'ai', domain: 'openrouter.ai', placeholder: 'sk-or-v1-\u2026' },
  { id: 'openai', name: 'OpenAI', tag: 'ai', domain: 'openai.com', placeholder: 'sk-proj-\u2026' },
  { id: 'anthropic', name: 'Anthropic Claude', tag: 'ai', domain: 'anthropic.com', placeholder: 'sk-ant-api03-\u2026' },
  { id: 'helius', name: 'Helius RPC', tag: 'rpc', domain: 'helius.dev', placeholder: 'xxxxxxxx-xxxx-\u2026' },
  { id: 'mistral', name: 'Mistral AI', tag: 'ai', domain: 'mistral.ai', placeholder: 'xxxxxxxxxxxxxxxx' },
  { id: 'cohere', name: 'Cohere', tag: 'ai', domain: 'cohere.ai', placeholder: 'xxxxxxxxxxxxxxxx' },
  { id: 'groq', name: 'Groq', tag: 'ai', domain: 'groq.com', placeholder: 'gsk_\u2026' },
];

const TYPE_TABS: { id: VaultItemType; label: string; icon: React.ReactNode; sub: string }[] = [
  { id: 'api_key', label: 'API Key', icon: <Key size={13} />, sub: 'OpenAI, Anthropic, Helius\u2026 proxied with zero-trust' },
  { id: 'password', label: 'Password', icon: <Lock size={13} />, sub: 'Username + password for any site' },
  { id: 'note', label: 'Secure Note', icon: <FileText size={13} />, sub: 'Encrypted text \u2014 recovery codes, secrets, etc.' },
  { id: 'env', label: '.env File', icon: <Terminal size={13} />, sub: 'Block of KEY=VALUE pairs for an app' },
  { id: 'ssh_key', label: 'SSH Key', icon: <KeyRound size={13} />, sub: 'Public + private key + passphrase' },
];

function slugify(s: string): string { return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'untitled'; }

const inputCls = 'w-full bg-[#0e1631] border border-[#243365] rounded-lg px-3 py-2 text-[13px] text-white placeholder:text-[#3e4a72] focus:outline-none focus:ring-1 focus:ring-white/10 focus:border-zinc-600 transition-colors';

export const AddKeyModal: React.FC<Props> = ({ isOpen, onClose, onSave, initialData }) => {
  const [type, setType] = useState<VaultItemType>('api_key');
  const [name, setName] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saveError, setSaveError] = useState('');
  const [busy, setBusy] = useState(false);
  const [provider, setProvider] = useState(PROVIDERS[0]);
  const [apiKeyValue, setApiKeyValue] = useState('');
  const [showValue, setShowValue] = useState(false);
  const [pwUsername, setPwUsername] = useState('');
  const [pwPassword, setPwPassword] = useState('');
  const [pwUrl, setPwUrl] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [envText, setEnvText] = useState('');
  const [sshPublic, setSshPublic] = useState('');
  const [sshPrivate, setSshPrivate] = useState('');
  const [sshPassphrase, setSshPassphrase] = useState('');
  const [sshComment, setSshComment] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const days = getPrefs().defaultExpiryDays;
    if (days > 0) { const d = new Date(Date.now() + days * 86400_000); setExpiryDate(d.toISOString().slice(0, 10)); }
    if (initialData) {
      if (initialData.name) setName(initialData.name);
      if (initialData.value) setApiKeyValue(initialData.value);
      if (initialData.domain) { const found = PROVIDERS.find(p => p.domain === initialData.domain || initialData.name?.toLowerCase().includes(p.name.toLowerCase())); if (found) { setProvider(found); setType('api_key'); } }
      if (initialData.notes) setNotes(initialData.notes);
    }
  }, [isOpen, initialData]);

  const reset = () => { setName(''); setExpiryDate(''); setNotes(''); setSaveError(''); setProvider(PROVIDERS[0]); setApiKeyValue(''); setShowValue(false); setPwUsername(''); setPwPassword(''); setPwUrl(''); setShowPw(false); setNoteContent(''); setEnvText(''); setSshPublic(''); setSshPrivate(''); setSshPassphrase(''); setSshComment(''); setType('api_key'); };

  if (!isOpen) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setSaveError('');
    try {
      let upstream: string; let rawKey: string; let domain = ''; let tag = type.replace('_', ' ');
      if (type === 'api_key') { if (!apiKeyValue) throw new Error('Paste the API key'); upstream = provider.id; rawKey = apiKeyValue; domain = provider.domain; tag = provider.tag; }
      else { if (!name) throw new Error('Give it a name'); upstream = `${TYPE_PREFIX[type]}${slugify(name)}`;
        if (type === 'password') { if (!pwPassword) throw new Error('Password required'); rawKey = JSON.stringify({ username: pwUsername, password: pwPassword, url: pwUrl, notes }); }
        else if (type === 'note') { if (!noteContent) throw new Error('Write something'); rawKey = JSON.stringify({ title: name, content: noteContent }); }
        else if (type === 'env') { if (!envText.trim()) throw new Error('Paste KEY=VALUE lines'); const vars = envText.split('\n').map(l => l.trim()).filter(Boolean).map(line => { const eq = line.indexOf('='); return eq < 0 ? null : { key: line.slice(0, eq).trim(), value: line.slice(eq + 1).trim() }; }).filter((v): v is { key: string; value: string } => v !== null); if (vars.length === 0) throw new Error('No valid KEY=VALUE lines'); rawKey = JSON.stringify({ vars, notes }); }
        else if (type === 'ssh_key') { if (!sshPrivate) throw new Error('Private key required'); rawKey = JSON.stringify({ publicKey: sshPublic, privateKey: sshPrivate, passphrase: sshPassphrase, comment: sshComment }); }
        else throw new Error('Unsupported type');
      }
      await onSave({ name: type === 'api_key' ? (name || provider.name) : name, domain, upstream, rawKey, value: rawKey, expiryDate, notes, type, tags: [tag, 'vault'] });
      reset(); onClose();
    } catch (err) { setSaveError(err instanceof Error ? err.message : 'Failed to save'); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#0b1226]/85 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-[#131c39] border border-[#243365]/50 rounded-xl shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#243365]/50 shrink-0">
          <div><h2 className="text-[16px] font-bold text-white uppercase tracking-wider">New Secret</h2><p className="text-[11px] text-[#8a96c2] mt-0.5">{TYPE_TABS.find(t => t.id === type)?.sub}</p></div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-[#8a96c2] hover:text-white hover:bg-white/5 transition-colors"><X size={16} /></button>
        </div>
        <div className="px-6 pt-4 shrink-0">
          <div className="grid grid-cols-5 gap-1 p-1 rounded-lg bg-[#0e1631] border border-[#243365]">
            {TYPE_TABS.map(t => <button key={t.id} type="button" onClick={() => { setType(t.id); setSaveError(''); }} className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition-colors ${type === t.id ? 'bg-white text-black' : 'text-[#8a96c2] hover:text-white'}`}>{t.icon}<span className="hidden sm:inline">{t.label}</span></button>)}
          </div>
        </div>
        <form onSubmit={submit} noValidate className="p-6 space-y-4 overflow-y-auto flex-1">
          <div className="space-y-1.5"><label className="text-[10px] text-[#8a96c2] uppercase tracking-wider">{type === 'api_key' ? 'Label' : type === 'note' ? 'Title' : 'Name'}{type === 'api_key' && <span className="text-[#3e4a72] ml-1">(optional)</span>}</label><input placeholder={type === 'api_key' ? 'e.g. Production API key' : type === 'password' ? 'e.g. GitHub' : type === 'note' ? 'e.g. Recovery codes' : 'e.g. deploy-key'} className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></div>

          {type === 'api_key' && (<>
            <div className="grid grid-cols-2 gap-4"><div className="space-y-1.5"><label className="text-[10px] text-[#8a96c2] uppercase tracking-wider">Provider</label><select className={inputCls + ' appearance-none cursor-pointer'} value={provider.id} onChange={(e) => { const found = PROVIDERS.find(p => p.id === e.target.value); if (found) setProvider(found); }}>{PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div><div className="space-y-1.5"><label className="text-[10px] text-[#8a96c2] uppercase tracking-wider">Expires</label><input type="date" className={inputCls + ' [color-scheme:dark]'} value={expiryDate} onChange={e => setExpiryDate(e.target.value)} /></div></div>
            <div className="space-y-1.5"><label className="text-[10px] text-[#8a96c2] uppercase tracking-wider">API Key</label><div className="relative"><input required type={showValue ? 'text' : 'password'} placeholder={provider.placeholder ?? 'Paste your API key'} className={inputCls + ' pr-12 font-mono'} value={apiKeyValue} onChange={(e) => setApiKeyValue(e.target.value)} /><button type="button" onClick={() => setShowValue(!showValue)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8a96c2] hover:text-white">{showValue ? <EyeOff size={15} /> : <Eye size={15} />}</button></div></div>
          </>)}

          {type === 'password' && (<>
            <div className="grid grid-cols-2 gap-4"><div className="space-y-1.5"><label className="text-[10px] text-[#8a96c2] uppercase tracking-wider">Username</label><input className={inputCls} value={pwUsername} onChange={e => setPwUsername(e.target.value)} placeholder="alice@example.com" /></div><div className="space-y-1.5"><label className="text-[10px] text-[#8a96c2] uppercase tracking-wider">URL</label><input className={inputCls} value={pwUrl} onChange={e => setPwUrl(e.target.value)} placeholder="https://github.com" /></div></div>
            <div className="space-y-1.5"><label className="text-[10px] text-[#8a96c2] uppercase tracking-wider">Password</label><div className="relative"><input required type={showPw ? 'text' : 'password'} className={inputCls + ' pr-12 font-mono'} value={pwPassword} onChange={e => setPwPassword(e.target.value)} /><button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8a96c2] hover:text-white">{showPw ? <EyeOff size={15} /> : <Eye size={15} />}</button></div></div>
          </>)}

          {type === 'note' && <div className="space-y-1.5"><label className="text-[10px] text-[#8a96c2] uppercase tracking-wider">Content</label><textarea required rows={8} className={inputCls + ' resize-y font-mono'} value={noteContent} onChange={e => setNoteContent(e.target.value)} placeholder="Recovery codes, license keys, anything encrypted." /></div>}
          {type === 'env' && <div className="space-y-1.5"><label className="text-[10px] text-[#8a96c2] uppercase tracking-wider">Environment Variables</label><textarea required rows={8} className={inputCls + ' resize-y font-mono text-[12px]'} value={envText} onChange={e => setEnvText(e.target.value)} placeholder="DATABASE_URL=postgres://localhost/myapp\nSTRIPE_SECRET=sk_live_\u2026" /><p className="text-[10px] text-[#3e4a72]">One KEY=VALUE per line.</p></div>}
          {type === 'ssh_key' && (<>
            <div className="space-y-1.5"><label className="text-[10px] text-[#8a96c2] uppercase tracking-wider">Public Key</label><textarea rows={2} className={inputCls + ' resize-y font-mono text-[11px]'} value={sshPublic} onChange={e => setSshPublic(e.target.value)} placeholder="ssh-ed25519 AAAA\u2026 alice@laptop" /></div>
            <div className="space-y-1.5"><label className="text-[10px] text-[#8a96c2] uppercase tracking-wider">Private Key</label><textarea required rows={6} className={inputCls + ' resize-y font-mono text-[11px]'} value={sshPrivate} onChange={e => setSshPrivate(e.target.value)} placeholder={'-----BEGIN OPENSSH PRIVATE KEY-----\n\u2026\n-----END OPENSSH PRIVATE KEY-----'} /></div>
            <div className="grid grid-cols-2 gap-4"><div className="space-y-1.5"><label className="text-[10px] text-[#8a96c2] uppercase tracking-wider">Passphrase</label><input type="password" className={inputCls + ' font-mono'} value={sshPassphrase} onChange={e => setSshPassphrase(e.target.value)} /></div><div className="space-y-1.5"><label className="text-[10px] text-[#8a96c2] uppercase tracking-wider">Comment</label><input className={inputCls} value={sshComment} onChange={e => setSshComment(e.target.value)} placeholder="alice@laptop" /></div></div>
          </>)}

          {(type === 'api_key' || type === 'password' || type === 'env') && <div className="space-y-1.5"><label className="text-[10px] text-[#8a96c2] uppercase tracking-wider">Notes</label><textarea placeholder="Optional context" rows={2} className={inputCls + ' resize-none'} value={notes} onChange={e => setNotes(e.target.value)} /></div>}

          {saveError && <div className="px-3 py-2 rounded-lg bg-red-950/30 border border-red-900/50"><p className="text-[12px] text-red-400">{saveError}</p></div>}

          <div className="pt-3 flex items-center justify-between border-t border-[#243365]/50">
            <span className="text-[11px] text-[#5e6a91]">AES-256-GCM \xb7 zero-knowledge</span>
            <div className="flex items-center gap-2"><button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] text-[#a8b3d8] hover:text-white hover:bg-white/5 transition-colors">Cancel</button>
              <button type="submit" disabled={busy} className="px-5 py-2 rounded-lg bg-white hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-[#5e6a91] text-black text-[13px] font-semibold uppercase tracking-wider transition-colors">{busy ? 'Encrypting\u2026' : 'Save Secret'}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
