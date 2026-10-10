import React, { useEffect, useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { Button } from './ui/Button';
import { fetchAutosignStatus } from '../lib/api';
import { DEFAULT_TAB_CAP_MICRO, openStreamTabAutosign, openStreamTabWallet, type OpenTabStep } from '../lib/wallet-mpp';

const STEPS: OpenTabStep[] = ['open', 'build', 'sign', 'record', 'done'];
const LABEL: Record<OpenTabStep, string> = {
  open: '开库 / open stream',
  build: 'build-open-tx',
  sign: '钱包弹窗 / wallet',
  record: 'record-tx',
  done: 'Explorer',
};

interface Props {
  onOpened?: (info: { streamId: number; explorerUrl: string; signature: string }) => void;
}

export const OpenStreamTab: React.FC<Props> = ({ onOpened }) => {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const [step, setStep] = useState<OpenTabStep | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(false);
  const [explorer, setExplorer] = useState('');
  const [autosign, setAutosign] = useState(false);

  useEffect(() => {
    fetchAutosignStatus().then((s) => setAutosign(!!s.loaded)).catch(() => setAutosign(false));
  }, []);

  const run = async (mode: 'wallet' | 'autosign') => {
    setBusy(true); setMsg(''); setOk(false); setExplorer(''); setStep('open');
    try {
      const result = mode === 'autosign'
        ? await openStreamTabAutosign({
            ownerPubkey: publicKey?.toBase58(),
            agentPubkey: publicKey?.toBase58(),
            maxTotalMicroUsdc: DEFAULT_TAB_CAP_MICRO,
            onProgress: (s) => setStep(s),
          })
        : await openStreamTabWallet({
            ownerPubkey: publicKey!.toBase58(),
            agentPubkey: publicKey!.toBase58(),
            maxTotalMicroUsdc: DEFAULT_TAB_CAP_MICRO,
            connection,
            sendTransaction,
            onProgress: (s) => setStep(s),
          });
      setExplorer(result.explorerUrl);
      setMsg(`${result.mode} · ${result.signature.slice(0, 8)}…`);
      setOk(true);
      setStep('done');
      onOpened?.({ streamId: result.streamId, explorerUrl: result.explorerUrl, signature: result.signature });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'open tab failed');
      setOk(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {STEPS.map((s) => (
          <span
            key={s}
            className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-md border ${
              step === s ? 'bg-white text-black border-white' : 'text-[#8a96c2] border-[#243365]'
            }`}
          >
            {LABEL[s]}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          onClick={() => (connected && publicKey ? run('wallet') : setVisible(true))}
          loading={busy}
        >
          {connected ? 'Open stream tab' : 'Connect Phantom'}
        </Button>
        {autosign && (
          <Button variant="secondary" onClick={() => run('autosign')} loading={busy}>
            Autosign (local owner)
          </Button>
        )}
      </div>
      <p className="text-[11px] text-[#8a96c2]">
        开库 → build-open-tx → wallet signs ix 24 + ATA fund → record-tx → Explorer.
        Cap {DEFAULT_TAB_CAP_MICRO} micro-USDC (1 Devnet USDC).
      </p>
      {msg && <p className={`text-[12px] ${ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg}</p>}
      {explorer && (
        <a href={explorer} target="_blank" rel="noreferrer" className="text-[12px] text-white hover:underline">
          View on Solana Explorer
        </a>
      )}
    </div>
  );
};
