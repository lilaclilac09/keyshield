import React, { useCallback, useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { fetchMppStatus, type MppStatusStrip } from '../lib/api';
import { deriveAta, getUsdcMint } from '../lib/solana';
import { SETTLE_LABEL, normalizeSettleMode } from '../lib/payment-status';

function fmtSol(lamports: number | null): string {
  if (lamports == null) return '—';
  return (lamports / 1_000_000_000).toFixed(3);
}

function fmtUsdc(micro: number | null): string {
  if (micro == null) return '—';
  return (micro / 1_000_000).toFixed(6);
}

const pill = 'flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-[#243365] bg-[#0b1226] text-[10px] uppercase tracking-wider';

export const StatusStrip: React.FC = () => {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [solLamports, setSolLamports] = useState<number | null>(null);
  const [usdcMicro, setUsdcMicro] = useState<number | null>(null);
  const [mpp, setMpp] = useState<MppStatusStrip | null>(null);

  const refresh = useCallback(async () => {
    const jobs: Promise<void>[] = [];
    if (publicKey) {
      const ata = deriveAta(publicKey, getUsdcMint());
      jobs.push((async () => {
        try {
          const infos = await connection.getMultipleAccountsInfo([publicKey, ata], { commitment: 'confirmed' });
          setSolLamports(infos[0]?.lamports ?? 0);
          const data = infos[1]?.data;
          if (data && data.length >= 72) {
            const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
            const amount = Number(view.getBigUint64(64, true));
            setUsdcMicro(amount);
          } else {
            setUsdcMicro(0);
          }
        } catch {
          setSolLamports(null);
          setUsdcMicro(null);
        }
      })());
    } else {
      setSolLamports(null);
      setUsdcMicro(null);
    }
    jobs.push((async () => {
      try { setMpp(await fetchMppStatus()); } catch { setMpp(null); }
    })());
    await Promise.all(jobs);
  }, [connection, publicKey]);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 15000);
    const onVis = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [refresh]);

  const receipt = mpp?.last_receipt;
  const mode = receipt ? normalizeSettleMode({ settle_mode: receipt.mode }) : null;

  return (
    <div className="h-10 border-b border-[#243365]/60 bg-[#0e1631] px-6 flex items-center gap-2 overflow-x-auto shrink-0">
      <span className="text-[9px] text-[#5e6a91] uppercase tracking-widest mr-1">Devnet</span>
      <div className={pill} title={publicKey ? publicKey.toBase58() : 'wallet not connected'}>
        <span className="text-[#5e6a91]">SOL</span>
        <span className="text-white font-mono">{fmtSol(solLamports)}</span>
      </div>
      <div className={pill} title="Circle Devnet USDC">
        <span className="text-[#5e6a91]">USDC</span>
        <span className="text-white font-mono">{fmtUsdc(usdcMicro)}</span>
      </div>
      <div className={pill}>
        <span className="text-[#5e6a91]">Stream</span>
        <span className="text-white font-mono">{fmtUsdc(mpp?.stream_remaining_micro_usdc ?? null)}</span>
      </div>
      <div className={pill} title={receipt?.signature || receipt?.hash || 'no receipt yet'}>
        <span className="text-[#5e6a91]">Receipt</span>
        {receipt ? (
          <>
            <span className="text-white font-mono">{receipt.hash8}</span>
            <span className={mode === 'submitted' ? 'text-emerald-300' : mode === 'failed' ? 'text-red-300' : 'text-amber-300'}>
              {mode ? SETTLE_LABEL[mode] : receipt.mode}
            </span>
          </>
        ) : (
          <span className="text-[#5e6a91]">none</span>
        )}
      </div>
    </div>
  );
};
