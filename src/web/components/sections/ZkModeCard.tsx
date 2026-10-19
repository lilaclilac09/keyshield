/**
 * ZK mode card (docs/zk/ZK-MODE.md). Shown inside Device Vault once it is
 * unlocked, because the ZK root is derived from the same passkey PRF output.
 *
 * - Turn on: registers root_id with the server and hands R to the extension.
 * - Migrate: re-saves plaintext keys as ciphertext, deletes the old rows,
 *   purges leftovers. Old provider keys should then be rotated.
 * - Unlock code: ksz1.… for `keyshield-proxy enroll` (local injection).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, Loader2, AlertCircle, Copy, Check, RefreshCw } from 'lucide-react';

import {
  b64u, enableZk, fetchZkStatus, getZkRoot, migratePlaintextToZk, onZkRootChange,
  unlockCode, zkRootId, type ZkStatus,
} from '../../lib/zk';
import { pushZkRootToExtension } from '../../lib/vault-key';

export const ZkModeCard: React.FC<{ onUnlock?: () => void; unlocking?: boolean }> = ({ onUnlock, unlocking }) => {
  const [status, setStatus] = useState<ZkStatus | null>(null);
  const [hasRoot, setHasRoot] = useState(() => getZkRoot() !== null);
  const [rootMatches, setRootMatches] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    const s = await fetchZkStatus().catch(() => null);
    setStatus(s);
    const root = getZkRoot();
    if (s?.enabled && root) setRootMatches((await zkRootId(root)) === s.root_id);
    else setRootMatches(null);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => onZkRootChange(() => { setHasRoot(getZkRoot() !== null); setCode(null); void refresh(); }), [refresh]);

  const sendToExtension = async () => {
    const root = getZkRoot();
    if (!root) return;
    pushZkRootToExtension(b64u(root), await zkRootId(root));
  };

  const turnOn = async () => {
    const root = getZkRoot();
    if (!root) return;
    setBusy('enable'); setErr(null); setMsg(null);
    try {
      await enableZk(root);
      await sendToExtension();
      setMsg('ZK mode is on. New keys saved by the extension are encrypted on this device first.');
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  };

  const migrate = async () => {
    const root = getZkRoot();
    if (!root) return;
    setBusy('migrate'); setErr(null); setMsg(null);
    try {
      const { moved, failed } = await migratePlaintextToZk(root, (d, t) => setMsg(`Re-saving ${d}/${t}…`));
      if (failed) setErr(`${failed} key(s) could not be moved. They are still stored the old way; try again.`);
      setMsg(`${moved} key(s) re-saved in ZK mode. Now rotate them at each provider: the old copies were readable by the server.`);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  };

  const reveal = () => {
    const root = getZkRoot();
    if (root) setCode(unlockCode(root));
  };

  const copy = async () => {
    if (!code) return;
    await navigator.clipboard.writeText(code).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!status) return null;

  return (
    <div className="rounded-xl border border-emerald-900/40 bg-[#0f1a2e] p-5 space-y-3" data-testid="zk-mode-card">
      <div className="flex items-center gap-2.5">
        <ShieldCheck size={16} className="text-emerald-400" />
        <p className="text-[13px] font-semibold text-white uppercase tracking-wider">ZK mode</p>
        <span className="text-[11px] text-[#5e6a91]">{status.enabled ? 'on' : 'off'} &middot; zk-v1</span>
      </div>
      <p className="text-[12px] text-[#8b95b7] leading-relaxed">
        Keys are encrypted on your device with a key derived from this passkey. The server keeps only
        ciphertext and a per-key share it can refuse to release (that is how revoke works). Keys are injected
        locally by the extension or <code>keyshield-proxy</code>. The hosted <code>/vproxy</code> can&apos;t use ZK keys.
      </p>

      {!hasRoot && (
        <div className="flex items-center gap-3">
          <p className="text-[12px] text-amber-300">Unlock with your passkey to manage ZK mode.</p>
          {onUnlock && (
            <button
              onClick={onUnlock}
              disabled={unlocking}
              className="px-3 py-1.5 rounded-lg border border-[#243365] text-[12px] text-[#e8ecff] hover:bg-white/[0.04] disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {unlocking && <Loader2 size={12} className="animate-spin" />} Unlock with passkey
            </button>
          )}
        </div>
      )}

      {hasRoot && !status.enabled && (
        <button
          onClick={turnOn}
          disabled={busy !== null}
          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[12px] font-medium disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          {busy === 'enable' && <Loader2 size={12} className="animate-spin" />} Turn on ZK mode
        </button>
      )}

      {hasRoot && status.enabled && rootMatches === false && (
        <p className="text-[12px] text-amber-300">
          ZK mode was turned on with a different passkey. Unlock with that passkey to use or migrate ZK keys.
        </p>
      )}

      {hasRoot && status.enabled && rootMatches && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button onClick={sendToExtension} className="px-3 py-1.5 rounded-lg border border-[#243365] text-[12px] text-[#e8ecff] hover:bg-white/[0.04] inline-flex items-center gap-1.5">
              <RefreshCw size={12} /> Send to extension
            </button>
            {status.plaintext_items > 0 && (
              <button
                onClick={migrate}
                disabled={busy !== null}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[12px] font-medium disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {busy === 'migrate' && <Loader2 size={12} className="animate-spin" />}
                Re-save {status.plaintext_items} older key{status.plaintext_items === 1 ? '' : 's'} in ZK mode
              </button>
            )}
            <button onClick={reveal} className="px-3 py-1.5 rounded-lg border border-[#243365] text-[12px] text-[#e8ecff] hover:bg-white/[0.04]">
              Show unlock code for keyshield-proxy
            </button>
          </div>
          <p className="text-[11px] text-[#5e6a91]">
            {status.zk_items} ZK key{status.zk_items === 1 ? '' : 's'} &middot; {status.plaintext_items} stored the old way (readable by the server)
          </p>
          {code && (
            <div className="space-y-1.5">
              <p className="text-[11px] text-amber-300">
                This code decrypts every ZK key (with the server share). Paste it only into
                <code> keyshield-proxy enroll</code> on a machine you trust. Don&apos;t share it.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate text-[11px] bg-black/30 rounded px-2 py-1.5 text-[#e8ecff]">{code}</code>
                <button onClick={copy} className="p-1.5 rounded border border-[#243365]" aria-label="Copy unlock code">
                  {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} className="text-[#8b95b7]" />}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {msg && <p className="text-[12px] text-emerald-300">{msg}</p>}
      {err && (
        <p className="text-[12px] text-red-300 inline-flex items-center gap-1.5"><AlertCircle size={12} /> {err}</p>
      )}
    </div>
  );
};
