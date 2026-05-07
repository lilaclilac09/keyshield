
import React, { useState, useEffect } from 'react';
import { X, Eye, EyeOff, Key, Lock, FileText, Terminal, KeyRound } from 'lucide-react';
import { VaultItem, VaultItemType, TYPE_PREFIX, PasswordPayload, NotePayload, EnvPayload, SSHKeyPayload } from '../types';
import { getPrefs } from '../lib/preferences';

interface Props {
  isOpen:    boolean;
  onClose:   () => void;
  onSave:    (item: Partial<VaultItem> & { upstream?: string; rawKey?: string }) => Promise<void> | void;
  initialData?: Partial<VaultItem>;
}

// ─── API key providers ───────────────────────────────────────────────────────
const PROVIDERS = [
  { id: 'openai',    name: 'OpenAI',           tag: 'ai',  domain: 'openai.com',    placeholder: 'sk-proj-…' },
  { id: 'anthropic', name: 'Anthropic Claude', tag: 'ai',  domain: 'anthropic.com', placeholder: 'sk-ant-api03-…' },
  { id: 'helius',    name: 'Helius RPC',       tag: 'rpc', domain: 'helius.dev',    placeholder: 'xxxxxxxx-xxxx-…' },
  { id: 'mistral',   name: 'Mistral AI',       tag: 'ai',  domain: 'mistral.ai',    placeholder: 'xxxxxxxxxxxxxxxx' },
  { id: 'cohere',    name: 'Cohere',           tag: 'ai',  domain: 'cohere.ai',     placeholder: 'xxxxxxxxxxxxxxxx' },
  { id: 'groq',      name: 'Groq',             tag: 'ai',  domain: 'groq.com',      placeholder: 'gsk_…' },
];

// ─── Type tabs ───────────────────────────────────────────────────────────────
const TYPE_TABS: { id: VaultItemType; label: string; icon: React.ReactNode; sub: string }[] = [
  { id: 'api_key',  label: 'API key',   icon: <Key size={13} />,       sub: 'OpenAI, Anthropic, Helius… proxied with zero-trust' },
  { id: 'password', label: 'Password',  icon: <Lock size={13} />,      sub: 'Username + password for any site' },
  { id: 'note',     label: 'Secure note', icon: <FileText size={13} />,sub: 'Encrypted text — recovery codes, secrets, etc.' },
  { id: 'env',      label: '.env file', icon: <Terminal size={13} />, sub: 'Block of KEY=VALUE pairs for an app' },
  { id: 'ssh_key',  label: 'SSH key',   icon: <KeyRound size={13} />,  sub: 'Public + private key + passphrase' },
];

// ─── Slug helpers ────────────────────────────────────────────────────────────
function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'untitled';
}

export const AddKeyModal: React.FC<Props> = ({ isOpen, onClose, onSave, initialData }) => {
  const [type, setType] = useState<VaultItemType>('api_key');

  // common fields
  const [name, setName]             = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [notes, setNotes]           = useState('');
  const [saveError, setSaveError]   = useState('');
  const [busy, setBusy]             = useState(false);

  // api_key fields
  const [provider, setProvider]   = useState(PROVIDERS[0]);
  const [apiKeyValue, setApiKeyValue] = useState('');
  const [showValue, setShowValue]     = useState(false);

  // password fields
  const [pwUsername, setPwUsername] = useState('');
  const [pwPassword, setPwPassword] = useState('');
  const [pwUrl, setPwUrl]           = useState('');
  const [showPw, setShowPw]         = useState(false);

  // note fields
  const [noteContent, setNoteContent] = useState('');

  // env fields
  const [envText, setEnvText]       = useState(''); // raw "KEY=VALUE\n" multi-line

  // ssh fields
  const [sshPublic, setSshPublic]       = useState('');
  const [sshPrivate, setSshPrivate]     = useState('');
  const [sshPassphrase, setSshPassphrase] = useState('');
  const [sshComment, setSshComment]     = useState('');

  useEffect(() => {
    if (!isOpen) return;
    // pre-fill expiry from prefs (default 90 days, 0 = none)
    const days = getPrefs().defaultExpiryDays;
    if (days > 0) {
      const d = new Date(Date.now() + days * 86400_000);
      setExpiryDate(d.toISOString().slice(0, 10));
    }
    if (initialData) {
      if (initialData.name)  setName(initialData.name);
      if (initialData.value) setApiKeyValue(initialData.value);
      if (initialData.domain) {
        const found = PROVIDERS.find(p => p.domain === initialData.domain || initialData.name?.toLowerCase().includes(p.name.toLowerCase()));
        if (found) { setProvider(found); setType('api_key'); }
      }
      if (initialData.notes) setNotes(initialData.notes);
    }
  }, [isOpen, initialData]);

  const reset = () => {
    setName(''); setExpiryDate(''); setNotes(''); setSaveError('');
    setProvider(PROVIDERS[0]); setApiKeyValue(''); setShowValue(false);
    setPwUsername(''); setPwPassword(''); setPwUrl(''); setShowPw(false);
    setNoteContent('');
    setEnvText('');
    setSshPublic(''); setSshPrivate(''); setSshPassphrase(''); setSshComment('');
    setType('api_key');
  };

  if (!isOpen) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setSaveError('');
    try {
      let upstream: string;
      let rawKey:   string;
      let domain   = '';
      let tag      = type.replace('_', ' ');

      if (type === 'api_key') {
        if (!apiKeyValue) throw new Error('Paste the API key');
        upstream = provider.id;
        rawKey   = apiKeyValue;
        domain   = provider.domain;
        tag      = provider.tag;
      } else {
        // user-defined secret — slug from name
        if (!name) throw new Error('Give it a name');
        upstream = `${TYPE_PREFIX[type]}${slugify(name)}`;

        if (type === 'password') {
          if (!pwPassword) throw new Error('Password required');
          const payload: PasswordPayload = { username: pwUsername, password: pwPassword, url: pwUrl, notes };
          rawKey = JSON.stringify(payload);
        } else if (type === 'note') {
          if (!noteContent) throw new Error('Write something in the note');
          const payload: NotePayload = { title: name, content: noteContent };
          rawKey = JSON.stringify(payload);
        } else if (type === 'env') {
          if (!envText.trim()) throw new Error('Paste at least one KEY=VALUE line');
          const vars = envText.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
            const eq = line.indexOf('=');
            return eq < 0 ? null : { key: line.slice(0, eq).trim(), value: line.slice(eq + 1).trim() };
          }).filter((v): v is { key: string; value: string } => v !== null);
          if (vars.length === 0) throw new Error('No valid KEY=VALUE lines found');
          const payload: EnvPayload = { vars, notes };
          rawKey = JSON.stringify(payload);
        } else if (type === 'ssh_key') {
          if (!sshPrivate) throw new Error('Private key required');
          const payload: SSHKeyPayload = { publicKey: sshPublic, privateKey: sshPrivate, passphrase: sshPassphrase, comment: sshComment };
          rawKey = JSON.stringify(payload);
        } else {
          throw new Error('Unsupported type');
        }
      }

      await onSave({
        name:    type === 'api_key' ? (name || provider.name) : name,
        domain,
        upstream,
        rawKey,
        value:   rawKey,
        expiryDate,
        notes,
        type,
        tags:    [tag, 'vault'],
      });
      reset();
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    'w-full bg-[#070912] border border-[#1c2238] rounded-lg px-4 py-2.5 text-[14px] text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#5b8cff]/60 transition-colors';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#05060d]/85 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-2xl max-h-[90vh] bg-[#0a0d1a] border border-[#1c2238] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1c2238] shrink-0">
          <div>
            <h2 className="text-[16px] font-semibold text-white">New secret</h2>
            <p className="text-[12px] text-zinc-500 mt-0.5">{TYPE_TABS.find(t => t.id === type)?.sub}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-white hover:bg-[#11162a] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Type tabs */}
        <div className="px-6 pt-4 shrink-0">
          <div className="grid grid-cols-5 gap-1 p-1 rounded-xl bg-[#070912] border border-[#1c2238]">
            {TYPE_TABS.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => { setType(t.id); setSaveError(''); }}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-medium transition-colors ${
                  type === t.id
                    ? 'bg-[#0e1430] text-white border border-[#1c2550]'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {t.icon}
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={submit} noValidate className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Name (always shown) */}
          <div className="space-y-1.5">
            <label className="text-[12px] text-zinc-400">
              {type === 'api_key' ? 'Label' : type === 'note' ? 'Title' : type === 'password' ? 'Site / app' : type === 'env' ? 'App / project' : 'Key name'}
              {type === 'api_key' && <span className="text-zinc-600 ml-1">(optional)</span>}
            </label>
            <input
              placeholder={type === 'api_key' ? 'e.g. Production API key' : type === 'password' ? 'e.g. GitHub' : type === 'note' ? 'e.g. Recovery codes' : type === 'env' ? 'e.g. backend-staging' : 'e.g. deploy-key'}
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* ── api_key fields ─────────────────────────────────────────── */}
          {type === 'api_key' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[12px] text-zinc-400">Provider</label>
                  <select
                    className={inputCls + ' appearance-none cursor-pointer'}
                    value={provider.id}
                    onChange={(e) => {
                      const found = PROVIDERS.find(p => p.id === e.target.value);
                      if (found) setProvider(found);
                    }}
                  >
                    {PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[12px] text-zinc-400">Expires</label>
                  <input type="date" className={inputCls + ' [color-scheme:dark]'} value={expiryDate} onChange={e => setExpiryDate(e.target.value)} />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[12px] text-zinc-400">API key</label>
                <div className="relative">
                  <input
                    required
                    type={showValue ? 'text' : 'password'}
                    placeholder={provider.placeholder ?? 'Paste your API key'}
                    className={inputCls + ' pr-12 font-mono'}
                    value={apiKeyValue}
                    onChange={(e) => setApiKeyValue(e.target.value)}
                  />
                  <button type="button" onClick={() => setShowValue(!showValue)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white">
                    {showValue ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ── password fields ────────────────────────────────────────── */}
          {type === 'password' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[12px] text-zinc-400">Username / email</label>
                  <input className={inputCls} value={pwUsername} onChange={e => setPwUsername(e.target.value)} placeholder="alice@example.com" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[12px] text-zinc-400">URL</label>
                  <input className={inputCls} value={pwUrl} onChange={e => setPwUrl(e.target.value)} placeholder="https://github.com" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] text-zinc-400">Password</label>
                <div className="relative">
                  <input required type={showPw ? 'text' : 'password'} className={inputCls + ' pr-12 font-mono'} value={pwPassword} onChange={e => setPwPassword(e.target.value)} />
                  <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white">
                    {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ── note fields ────────────────────────────────────────────── */}
          {type === 'note' && (
            <div className="space-y-1.5">
              <label className="text-[12px] text-zinc-400">Content</label>
              <textarea
                required
                rows={8}
                className={inputCls + ' resize-y font-mono'}
                value={noteContent}
                onChange={e => setNoteContent(e.target.value)}
                placeholder="Recovery codes, license keys, anything you'd put in a sticky note but encrypted."
              />
            </div>
          )}

          {/* ── env fields ─────────────────────────────────────────────── */}
          {type === 'env' && (
            <div className="space-y-1.5">
              <label className="text-[12px] text-zinc-400 flex items-center justify-between">
                <span>Environment variables</span>
                <span className="text-[10px] text-zinc-600">paste a .env file directly</span>
              </label>
              <textarea
                required
                rows={8}
                className={inputCls + ' resize-y font-mono text-[12px]'}
                value={envText}
                onChange={e => setEnvText(e.target.value)}
                placeholder={`DATABASE_URL=postgres://localhost/myapp\nSTRIPE_SECRET=sk_live_…\nSENTRY_DSN=https://…`}
              />
              <p className="text-[10px] text-zinc-600">One KEY=VALUE per line. Lines without <code>=</code> are skipped.</p>
            </div>
          )}

          {/* ── ssh fields ─────────────────────────────────────────────── */}
          {type === 'ssh_key' && (
            <>
              <div className="space-y-1.5">
                <label className="text-[12px] text-zinc-400">Public key (optional)</label>
                <textarea rows={2} className={inputCls + ' resize-y font-mono text-[11px]'} value={sshPublic} onChange={e => setSshPublic(e.target.value)} placeholder="ssh-ed25519 AAAA… alice@laptop" />
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] text-zinc-400">Private key</label>
                <textarea required rows={6} className={inputCls + ' resize-y font-mono text-[11px]'} value={sshPrivate} onChange={e => setSshPrivate(e.target.value)} placeholder={'-----BEGIN OPENSSH PRIVATE KEY-----\n…\n-----END OPENSSH PRIVATE KEY-----'} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[12px] text-zinc-400">Passphrase (optional)</label>
                  <input type="password" className={inputCls + ' font-mono'} value={sshPassphrase} onChange={e => setSshPassphrase(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[12px] text-zinc-400">Comment</label>
                  <input className={inputCls} value={sshComment} onChange={e => setSshComment(e.target.value)} placeholder="alice@laptop" />
                </div>
              </div>
            </>
          )}

          {/* Notes (only for api_key / password / env) */}
          {(type === 'api_key' || type === 'password' || type === 'env') && (
            <div className="space-y-1.5">
              <label className="text-[12px] text-zinc-400">Notes</label>
              <textarea placeholder="Optional context" rows={2} className={inputCls + ' resize-none'} value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          )}

          {saveError && (
            <div className="px-3 py-2 rounded-lg bg-rose-950/30 border border-rose-900/50">
              <p className="text-[12px] text-rose-300">{saveError}</p>
            </div>
          )}

          <div className="pt-3 flex items-center justify-between border-t border-[#1c2238]">
            <span className="text-[11px] text-zinc-500">AES-256-GCM · zero-knowledge</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] text-zinc-300 hover:text-white hover:bg-[#11162a] transition-colors">Cancel</button>
              <button
                type="submit"
                disabled={busy}
                className="px-5 py-2 rounded-lg bg-[#5b8cff] hover:bg-[#7aa1ff] disabled:bg-[#1c2238] disabled:text-zinc-500 text-white text-[13px] font-medium transition-colors"
              >
                {busy ? 'Encrypting…' : 'Save secret'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
