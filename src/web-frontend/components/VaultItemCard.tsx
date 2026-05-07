import React, { useState, useEffect, useRef } from 'react';
import {
  Eye, EyeOff, Key, Copy, Trash2, Check, Loader2, ExternalLink, Link2, Shield,
  Lock, FileText, Terminal, KeyRound,
} from 'lucide-react';
import { VaultItem, PasswordPayload, NotePayload, EnvPayload, SSHKeyPayload } from '../types';
import { getPrefs } from '../lib/preferences';
import { ConfirmButton } from './ui/ConfirmButton';

interface Props {
  item:      VaultItem;
  onDelete:  (id: string) => void;
  onDecrypt: (id: string) => Promise<string>;
}

const TYPE_ICON: Record<VaultItem['type'], React.ReactNode> = {
  api_key:  <Key size={13} className="text-[#5b8cff]" strokeWidth={1.75} />,
  password: <Lock size={13} className="text-amber-400" strokeWidth={1.75} />,
  note:     <FileText size={13} className="text-zinc-300" strokeWidth={1.75} />,
  env:      <Terminal size={13} className="text-emerald-400" strokeWidth={1.75} />,
  ssh_key:  <KeyRound size={13} className="text-violet-400" strokeWidth={1.75} />,
};

const TYPE_BG: Record<VaultItem['type'], string> = {
  api_key:  'bg-[#0e1430] border-[#1c2550]',
  password: 'bg-amber-950/30 border-amber-900/40',
  note:     'bg-zinc-800/40 border-zinc-700/40',
  env:      'bg-emerald-950/30 border-emerald-900/40',
  ssh_key:  'bg-violet-950/30 border-violet-900/40',
};

export const VaultItemCard: React.FC<Props> = ({ item, onDelete, onDecrypt }) => {
  const [isRevealed,   setIsRevealed]   = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [rawValue,     setRawValue]     = useState('');
  const [decryptErr,   setDecryptErr]   = useState('');
  const [timeLeft,     setTimeLeft]     = useState(0);
  const [keyCopied,    setKeyCopied]    = useState(false);
  const [proxyCopied,  setProxyCopied]  = useState(false);
  const timerRef = useRef<number | null>(null);
  const REVEAL_DURATION = getPrefs().revealDurationSec;

  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeLeft(REVEAL_DURATION);
    timerRef.current = window.setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearReveal(); return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  const clearReveal = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRevealed(false);
    setRawValue('');
    setTimeLeft(0);
  };

  const handleReveal = async () => {
    if (isRevealed) { clearReveal(); return; }
    setIsDecrypting(true);
    setDecryptErr('');
    try {
      const v = await onDecrypt(item.id);
      setRawValue(v);
      setIsRevealed(true);
      startTimer();
    } catch (e) {
      setDecryptErr(e instanceof Error ? e.message : 'Decrypt failed');
    } finally {
      setIsDecrypting(false);
    }
  };

  const copyToClipboard = (text: string, setCopied: (b: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  // Parse decrypted JSON for non-api_key types
  let parsed: PasswordPayload | NotePayload | EnvPayload | SSHKeyPayload | null = null;
  if (isRevealed && rawValue && item.type !== 'api_key') {
    try { parsed = JSON.parse(rawValue); } catch { /* malformed — show raw */ }
  }

  return (
    <div className="group rounded-xl border border-[#1c2238] bg-[#0a0d1a]/60 hover:border-[#2a3358] transition-colors p-4">

      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${TYPE_BG[item.type]}`}>
            {TYPE_ICON[item.type]}
          </div>
          <div className="min-w-0">
            <h3 className="text-[14px] font-medium text-white truncate leading-tight">{item.name || 'Untitled'}</h3>
            {item.domain && <p className="text-[11px] text-zinc-500 truncate">{item.domain}</p>}
            {item.type !== 'api_key' && !item.domain && (
              <p className="text-[11px] text-zinc-500 capitalize">{item.type.replace('_', ' ')}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {item.type === 'api_key' && (
            <div
              className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded border border-emerald-900/50 bg-emerald-950/30 text-emerald-400"
              title="Self-custodian: stored encrypted in your vault. KeyShield never sees the plaintext."
            >
              <Shield size={8} strokeWidth={2.5} />
              <span>SELF-CUSTODIAN</span>
            </div>
          )}
          <ConfirmButton
            variant="destructive"
            onConfirm={() => onDelete(item.id)}
            title="Delete (click twice)"
            confirmLabel="Confirm"
            className="h-7 px-2 rounded-md text-[11px] flex items-center gap-1 lg:opacity-0 lg:group-hover:opacity-100 focus:opacity-100"
          >
            <Trash2 size={12} />
          </ConfirmButton>
        </div>
      </div>

      {/* Body — depends on type */}
      {item.type === 'api_key' ? (
        <ApiKeyBody
          rawKey={isRevealed ? rawValue : ''}
          isDecrypting={isDecrypting}
          isRevealed={isRevealed}
          timeLeft={timeLeft}
          decryptErr={decryptErr}
          keyCopied={keyCopied}
          proxyCopied={proxyCopied}
          proxyUrl={item.value}
          onReveal={handleReveal}
          onCopyKey={() => copyToClipboard(rawValue, setKeyCopied)}
          onCopyProxy={() => copyToClipboard(item.value, setProxyCopied)}
        />
      ) : item.type === 'password' && parsed ? (
        <PasswordBody payload={parsed as PasswordPayload} timeLeft={timeLeft} onCopyKey={(text) => copyToClipboard(text, setKeyCopied)} keyCopied={keyCopied} onHide={clearReveal} />
      ) : item.type === 'note' && parsed ? (
        <NoteBody payload={parsed as NotePayload} timeLeft={timeLeft} onCopy={(text) => copyToClipboard(text, setKeyCopied)} copied={keyCopied} onHide={clearReveal} />
      ) : item.type === 'env' && parsed ? (
        <EnvBody payload={parsed as EnvPayload} timeLeft={timeLeft} onCopy={(text) => copyToClipboard(text, setKeyCopied)} copied={keyCopied} onHide={clearReveal} />
      ) : item.type === 'ssh_key' && parsed ? (
        <SSHBody payload={parsed as SSHKeyPayload} timeLeft={timeLeft} onCopy={(text) => copyToClipboard(text, setKeyCopied)} copied={keyCopied} onHide={clearReveal} />
      ) : (
        <RevealButton onReveal={handleReveal} isDecrypting={isDecrypting} decryptErr={decryptErr} />
      )}

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex gap-1.5 flex-wrap">
          {item.tags.slice(0, 3).map(tag => (
            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-[#11162a] border border-[#1c2238] text-zinc-500">
              {tag.toLowerCase()}
            </span>
          ))}
        </div>
        <span className="text-[10px] text-zinc-600">
          {new Date(item.createdAt).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
};

// ─── Sub-components per type ─────────────────────────────────────────────────

const RevealButton: React.FC<{ onReveal: () => void; isDecrypting: boolean; decryptErr: string }> = ({ onReveal, isDecrypting, decryptErr }) => (
  <div>
    <button
      onClick={onReveal}
      disabled={isDecrypting}
      className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-[#070912] border border-[#141a2e] hover:border-[#1c2550] text-[12px] text-zinc-300 hover:text-white transition-colors"
    >
      {isDecrypting
        ? <><Loader2 size={13} className="animate-spin" /> Decrypting…</>
        : <><Eye size={13} /> Reveal</>}
    </button>
    {decryptErr && <p className="text-[11px] text-rose-400 mt-1">{decryptErr}</p>}
  </div>
);

const ApiKeyBody: React.FC<{
  rawKey: string; isDecrypting: boolean; isRevealed: boolean; timeLeft: number;
  decryptErr: string; keyCopied: boolean; proxyCopied: boolean; proxyUrl: string;
  onReveal: () => void; onCopyKey: () => void; onCopyProxy: () => void;
}> = (p) => (
  <>
    <div className="mb-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-zinc-600 uppercase tracking-wider">Raw API key</span>
        {p.timeLeft > 0 && <span className="text-[10px] text-[#5b8cff] font-mono">hides in {p.timeLeft}s</span>}
      </div>
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#070912] border border-[#141a2e]">
        <code className={`flex-1 text-[12px] font-mono break-all ${p.isRevealed ? 'text-emerald-300 select-all' : 'text-zinc-600'}`}>
          {p.isDecrypting ? '…decrypting' : p.isRevealed ? p.rawKey : '••••••••••••••••••••••••'}
        </code>
        <button onClick={p.onReveal} disabled={p.isDecrypting} className="shrink-0 text-zinc-500 hover:text-[#5b8cff] transition-colors" title={p.isRevealed ? 'Hide' : 'Reveal'}>
          {p.isDecrypting ? <Loader2 size={13} className="animate-spin" /> : p.isRevealed ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
        {p.isRevealed && (
          <button onClick={p.onCopyKey} className={`shrink-0 transition-colors ${p.keyCopied ? 'text-emerald-400' : 'text-zinc-500 hover:text-white'}`} title="Copy key">
            {p.keyCopied ? <Check size={13} /> : <Copy size={13} />}
          </button>
        )}
      </div>
      {p.decryptErr && <p className="text-[11px] text-rose-400 mt-1">{p.decryptErr}</p>}
    </div>

    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-zinc-600 uppercase tracking-wider flex items-center gap-1">
          <Link2 size={9} /> Proxy URL <span className="text-zinc-700">(use this in your agents)</span>
        </span>
      </div>
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#070912] border border-[#141a2e]">
        <code className="flex-1 text-[11px] font-mono text-zinc-400 truncate">{p.proxyUrl}</code>
        <button onClick={p.onCopyProxy} className={`shrink-0 transition-colors ${p.proxyCopied ? 'text-emerald-400' : 'text-zinc-600 hover:text-white'}`} title="Copy proxy URL">
          {p.proxyCopied ? <Check size={12} /> : <Copy size={12} />}
        </button>
        <a href={p.proxyUrl} target="_blank" rel="noreferrer" className="shrink-0 text-zinc-600 hover:text-zinc-300 transition-colors" title="Open">
          <ExternalLink size={12} />
        </a>
      </div>
    </div>
  </>
);

const HideStrip: React.FC<{ timeLeft: number; onHide: () => void }> = ({ timeLeft, onHide }) => (
  <div className="flex items-center justify-between mb-2">
    <span className="text-[10px] text-emerald-400 font-mono">REVEALED · hides in {timeLeft}s</span>
    <button onClick={onHide} className="text-[11px] text-zinc-500 hover:text-white">
      Hide now
    </button>
  </div>
);

const PasswordBody: React.FC<{ payload: PasswordPayload; timeLeft: number; keyCopied: boolean; onCopyKey: (s: string) => void; onHide: () => void }> = ({ payload, timeLeft, keyCopied, onCopyKey, onHide }) => (
  <div>
    <HideStrip timeLeft={timeLeft} onHide={onHide} />
    <div className="space-y-1.5">
      {payload.username && <Field label="Username" value={payload.username} onCopy={() => onCopyKey(payload.username)} mono={false} />}
      <Field label="Password" value={payload.password} onCopy={() => onCopyKey(payload.password)} mono copiedAccent={keyCopied} />
      {payload.url && <Field label="URL" value={payload.url} onCopy={() => onCopyKey(payload.url || '')} mono={false} link />}
    </div>
  </div>
);

const NoteBody: React.FC<{ payload: NotePayload; timeLeft: number; copied: boolean; onCopy: (s: string) => void; onHide: () => void }> = ({ payload, timeLeft, copied, onCopy, onHide }) => (
  <div>
    <HideStrip timeLeft={timeLeft} onHide={onHide} />
    <div className="px-3 py-2.5 rounded-lg bg-[#070912] border border-[#141a2e]">
      <pre className="text-[12px] font-mono text-zinc-200 whitespace-pre-wrap break-words leading-relaxed select-all">{payload.content}</pre>
      <button onClick={() => onCopy(payload.content)} className={`mt-2 flex items-center gap-1 text-[10px] ${copied ? 'text-emerald-400' : 'text-zinc-500 hover:text-white'}`}>
        {copied ? <Check size={11} /> : <Copy size={11} />}
        {copied ? 'Copied' : 'Copy note'}
      </button>
    </div>
  </div>
);

const EnvBody: React.FC<{ payload: EnvPayload; timeLeft: number; copied: boolean; onCopy: (s: string) => void; onHide: () => void }> = ({ payload, timeLeft, copied, onCopy, onHide }) => {
  const envText = payload.vars.map(v => `${v.key}=${v.value}`).join('\n');
  return (
    <div>
      <HideStrip timeLeft={timeLeft} onHide={onHide} />
      <div className="px-3 py-2.5 rounded-lg bg-[#070912] border border-[#141a2e]">
        <pre className="text-[11px] font-mono text-zinc-200 whitespace-pre-wrap break-all leading-relaxed select-all">{envText}</pre>
        <button onClick={() => onCopy(envText)} className={`mt-2 flex items-center gap-1 text-[10px] ${copied ? 'text-emerald-400' : 'text-zinc-500 hover:text-white'}`}>
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? 'Copied' : `Copy ${payload.vars.length} var${payload.vars.length !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  );
};

const SSHBody: React.FC<{ payload: SSHKeyPayload; timeLeft: number; copied: boolean; onCopy: (s: string) => void; onHide: () => void }> = ({ payload, timeLeft, copied, onCopy, onHide }) => (
  <div>
    <HideStrip timeLeft={timeLeft} onHide={onHide} />
    <div className="space-y-1.5">
      {payload.publicKey && <Field label="Public" value={payload.publicKey} onCopy={() => onCopy(payload.publicKey)} mono />}
      <Field label="Private" value={`${payload.privateKey.slice(0, 28)}…${payload.privateKey.slice(-12)}`} onCopy={() => onCopy(payload.privateKey)} mono copiedAccent={copied} />
      {payload.passphrase && <Field label="Passphrase" value={payload.passphrase} onCopy={() => onCopy(payload.passphrase || '')} mono />}
    </div>
  </div>
);

const Field: React.FC<{ label: string; value: string; onCopy: () => void; mono: boolean; link?: boolean; copiedAccent?: boolean }> = ({ label, value, onCopy, mono, link, copiedAccent }) => (
  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#070912] border border-[#141a2e]">
    <span className="text-[10px] text-zinc-600 uppercase tracking-wider w-16 shrink-0">{label}</span>
    {link ? (
      <a href={value} target="_blank" rel="noreferrer" className="flex-1 text-[12px] text-[#5b8cff] hover:underline truncate">{value}</a>
    ) : (
      <code className={`flex-1 text-[12px] truncate select-all ${mono ? 'font-mono' : ''} ${copiedAccent ? 'text-emerald-300' : 'text-zinc-200'}`}>{value}</code>
    )}
    <button onClick={onCopy} className="shrink-0 text-zinc-500 hover:text-white" title="Copy">
      <Copy size={12} />
    </button>
  </div>
);
