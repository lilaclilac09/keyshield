import React, { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, Key, Copy, Trash2, Check, Shield, Lock, FileText, Terminal, KeyRound } from 'lucide-react';
import { VaultItem, PasswordPayload, NotePayload, EnvPayload, SSHKeyPayload } from '../types';
import { getPrefs } from '../lib/preferences';
import { ConfirmButton } from './ui/ConfirmButton';
import { CopyButton } from './ui/CopyButton';

interface Props { item: VaultItem; onDelete: (id: string) => void; onDecrypt: (id: string) => Promise<string>; }

const TYPE_ICON: Record<VaultItem['type'], React.ReactNode> = {
  api_key: <Key size={13} className="text-white" strokeWidth={1.75} />,
  password: <Lock size={13} className="text-amber-400" strokeWidth={1.75} />,
  note: <FileText size={13} className="text-[#e8ecff]" strokeWidth={1.75} />,
  env: <Terminal size={13} className="text-emerald-400" strokeWidth={1.75} />,
  ssh_key: <KeyRound size={13} className="text-violet-400" strokeWidth={1.75} />,
};

const TYPE_BG: Record<VaultItem['type'], string> = {
  api_key: 'bg-zinc-900 border-[#2e4585]', password: 'bg-amber-950/30 border-amber-900/40',
  note: 'bg-zinc-800/40 border-[#2e4585]/40', env: 'bg-emerald-950/30 border-emerald-900/40', ssh_key: 'bg-violet-950/30 border-violet-900/40',
};

export const VaultItemCard: React.FC<Props> = ({ item, onDelete, onDecrypt }) => {
  const [isRevealed, setIsRevealed] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [rawValue, setRawValue] = useState('');
  const [decryptErr, setDecryptErr] = useState('');
  const [timeLeft, setTimeLeft] = useState(0);
  const [keyCopied, setKeyCopied] = useState(false);
  const timerRef = useRef<number | null>(null);
  const REVEAL_DURATION = getPrefs().revealDurationSec;

  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeLeft(REVEAL_DURATION);
    timerRef.current = window.setInterval(() => { setTimeLeft(prev => { if (prev <= 1) { clearReveal(); return 0; } return prev - 1; }); }, 1000);
  };
  const clearReveal = () => { if (timerRef.current) clearInterval(timerRef.current); setIsRevealed(false); setRawValue(''); setTimeLeft(0); };

  const handleReveal = async () => {
    if (isRevealed) { clearReveal(); return; }
    setIsDecrypting(true); setDecryptErr('');
    try { const v = await onDecrypt(item.id); setRawValue(v); setIsRevealed(true); startTimer(); }
    catch (e) { setDecryptErr(e instanceof Error ? e.message : 'Decrypt failed'); }
    finally { setIsDecrypting(false); }
  };
  const copyToClipboard = (text: string, setCopied: (b: boolean) => void) => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  // Typed as `any` because JSON.parse output cannot be statically guaranteed
  // to match a discriminated union; each `item.type === 'X'` branch below
  // narrows behaviorally and accesses the corresponding shape's fields.
  let parsed: any = null;
  if (isRevealed && rawValue && item.type !== 'api_key') { try { parsed = JSON.parse(rawValue); } catch { /* malformed */ } }

  return (
    <div className="group rounded-xl border border-[#243365]/50 bg-[#131c39] hover:border-[#2e4585] transition-colors p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${TYPE_BG[item.type]}`}>{TYPE_ICON[item.type]}</div>
          <div className="min-w-0">
            <h3 className="text-[14px] font-medium text-white truncate leading-tight">{item.name || 'Untitled'}</h3>
            {item.domain && <p className="text-[11px] text-[#8a96c2] truncate">{item.domain}</p>}
            {item.type !== 'api_key' && !item.domain && <p className="text-[11px] text-[#8a96c2] capitalize">{item.type.replace('_', ' ')}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {item.type === 'api_key' && <div className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded border border-emerald-900/50 bg-emerald-950/30 text-emerald-400" title="Self-custodian: encrypted in your vault"><Shield size={8} strokeWidth={2.5} />SELF-CUSTODIAN</div>}
          <ConfirmButton variant="destructive" onConfirm={() => onDelete(item.id)} title="Delete (click twice)" confirmLabel="Confirm" className="h-7 px-2 rounded-lg text-[11px] flex items-center gap-1"><Trash2 size={12} /></ConfirmButton>
        </div>
      </div>

      {item.type === 'api_key' ? (
        <>
          <div className="mb-2">
            <div className="flex items-center justify-between mb-1"><span className="text-[10px] text-[#5e6a91] uppercase tracking-wider">Raw API key</span>{timeLeft > 0 && <span className="text-[10px] text-white font-mono">hides in {timeLeft}s</span>}</div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0e1631] border border-[#243365]">
              <code className={`flex-1 text-[12px] font-mono break-all ${isRevealed ? 'text-emerald-300 select-all' : 'text-[#5e6a91]'}`}>{isDecrypting ? '\u2026decrypting' : isRevealed ? rawValue : '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}</code>
              <button onClick={handleReveal} disabled={isDecrypting} className="shrink-0 text-[#8a96c2] hover:text-white transition-colors" title={isRevealed ? 'Hide' : 'Reveal'}>
                {isDecrypting ? <span className="animate-spin">&#x25cb;</span> : isRevealed ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
              {isRevealed && <button onClick={() => copyToClipboard(rawValue, setKeyCopied)} className={`shrink-0 transition-colors ${keyCopied ? 'text-emerald-400' : 'text-[#8a96c2] hover:text-white'}`} title="Copy key">{keyCopied ? <Check size={13} /> : <Copy size={13} />}</button>}
            </div>
            {decryptErr && <p className="text-[11px] text-red-400 mt-1">{decryptErr}</p>}
          </div>
          <div>
            <div className="flex items-center justify-between mb-1"><span className="text-[10px] text-[#5e6a91] uppercase tracking-wider">Proxy URL <span className="text-[#3e4a72]">(use this in your agents)</span></span></div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0e1631] border border-[#243365]">
              <code className="flex-1 text-[11px] font-mono text-[#a8b3d8] truncate">{item.value}</code>
              <CopyButton text={item.value} size={12} />
            </div>
          </div>
        </>
      ) : item.type === 'password' && parsed ? (
        <div><p className="text-[12px] text-emerald-400 font-mono mb-1">REVEALED \xb7 hides in {timeLeft}s</p>
          {parsed.username && <Field label="Username" value={parsed.username} onCopy={() => copyToClipboard(parsed.username, setKeyCopied)} />}
          <Field label="Password" value={parsed.password} onCopy={() => copyToClipboard(parsed.password, setKeyCopied)} mono />
          {parsed.url && <Field label="URL" value={parsed.url} onCopy={() => copyToClipboard(parsed.url || '', setKeyCopied)} link />}
        </div>
      ) : item.type === 'note' && parsed ? (
        <div><p className="text-[12px] text-emerald-400 font-mono mb-1">REVEALED \xb7 hides in {timeLeft}s</p>
          <div className="px-3 py-2.5 rounded-lg bg-[#0e1631] border border-[#243365]"><pre className="text-[12px] font-mono text-zinc-200 whitespace-pre-wrap break-words leading-relaxed select-all">{parsed.content}</pre>
          <button onClick={() => copyToClipboard(parsed.content, setKeyCopied)} className={`mt-2 flex items-center gap-1 text-[10px] ${keyCopied ? 'text-emerald-400' : 'text-[#8a96c2] hover:text-white'}`}>{keyCopied ? <Check size={11} /> : <Copy size={11} />}{keyCopied ? 'Copied' : 'Copy note'}</button></div>
        </div>
      ) : item.type === 'env' && parsed ? (
        <div><p className="text-[12px] text-emerald-400 font-mono mb-1">REVEALED \xb7 hides in {timeLeft}s</p>
          <div className="px-3 py-2.5 rounded-lg bg-[#0e1631] border border-[#243365]"><pre className="text-[11px] font-mono text-zinc-200 whitespace-pre-wrap break-all leading-relaxed select-all">{parsed.vars.map((v: { key: string; value: string }) => `${v.key}=${v.value}`).join('\n')}</pre>
          <button onClick={() => copyToClipboard(parsed.vars.map((v: { key: string; value: string }) => `${v.key}=${v.value}`).join('\n'), setKeyCopied)} className={`mt-2 flex items-center gap-1 text-[10px] ${keyCopied ? 'text-emerald-400' : 'text-[#8a96c2] hover:text-white'}`}>{keyCopied ? <Check size={11} /> : <Copy size={11} />}{keyCopied ? 'Copied' : `Copy ${parsed.vars.length} var${parsed.vars.length !== 1 ? 's' : ''}`}</button></div>
        </div>
      ) : item.type === 'ssh_key' && parsed ? (
        <div><p className="text-[12px] text-emerald-400 font-mono mb-1">REVEALED \xb7 hides in {timeLeft}s</p>
          {parsed.publicKey && <Field label="Public" value={parsed.publicKey} onCopy={() => copyToClipboard(parsed.publicKey, setKeyCopied)} mono />}
          <Field label="Private" value={`${parsed.privateKey.slice(0, 28)}\u2026${parsed.privateKey.slice(-12)}`} onCopy={() => copyToClipboard(parsed.privateKey, setKeyCopied)} mono />
        </div>
      ) : (
        <div><button onClick={handleReveal} disabled={isDecrypting} className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-[#0e1631] border border-[#243365] hover:border-[#2e4585] text-[12px] text-[#e8ecff] hover:text-white transition-colors">
          {isDecrypting ? <><span className="animate-spin">&#x25cb;</span> Decrypting\u2026</> : <><Eye size={13} /> Reveal</>}
        </button>{decryptErr && <p className="text-[11px] text-red-400 mt-1">{decryptErr}</p>}</div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <div className="flex gap-1.5 flex-wrap">{item.tags.slice(0, 3).map(tag => <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-900 border border-[#243365] text-[#8a96c2]">{tag.toLowerCase()}</span>)}</div>
        <span className="text-[10px] text-[#5e6a91]">{new Date(item.createdAt).toLocaleDateString()}</span>
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; value: string; onCopy: () => void; mono?: boolean; link?: boolean }> = ({ label, value, onCopy, mono, link }) => (
  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0e1631] border border-[#243365] mb-1.5">
    <span className="text-[10px] text-[#5e6a91] uppercase tracking-wider w-16 shrink-0">{label}</span>
    {link ? <a href={value} target="_blank" rel="noreferrer" className="flex-1 text-[12px] text-blue-400 hover:underline truncate">{value}</a> : <code className={`flex-1 text-[12px] truncate select-all ${mono ? 'font-mono' : ''}`}>{value}</code>}
    <button onClick={onCopy} className="shrink-0 text-[#8a96c2] hover:text-white" title="Copy"><Copy size={12} /></button>
  </div>
);
