/**
 * Wallet connect + top-up, using the existing wallet-adapter provider
 * (SolanaProvider: wallet-standard wallets such as Phantom and Backpack are
 * detected automatically; Solflare also has an adapter for its web wallet).
 * Top-ups use the existing flows: SOL via /billing/sol-quote +
 * /billing/topup-solana, USDC via /billing/topup-solana-usdc.
 */
import React, { useMemo, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletReadyState } from '@solana/wallet-adapter-base';
import { topupSolWithWallet } from '../../lib/sol-topup';
import { creditUsdcTopup } from '../../lib/api';

function short(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : addr;
}

export const WalletPanel: React.FC<{ onCredited: () => void }> = ({ onCredited }) => {
  const { wallets, wallet, select, connect, disconnect, connected, connecting, publicKey, sendTransaction } = useWallet();
  const [amount, setAmount] = useState('1');
  const [sig, setSig] = useState('');
  const [busy, setBusy] = useState<'sol' | 'usdc' | 'connect' | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const { ready, missing } = useMemo(() => {
    const seen = new Set<string>();
    const r: typeof wallets = [];
    const m: typeof wallets = [];
    for (const w of wallets) {
      if (seen.has(w.adapter.name)) continue;
      seen.add(w.adapter.name);
      if (w.readyState === WalletReadyState.Installed || w.readyState === WalletReadyState.Loadable) r.push(w);
      else if (w.readyState === WalletReadyState.NotDetected) m.push(w);
    }
    return { ready: r, missing: m };
  }, [wallets]);

  const pick = async (name: string) => {
    setMsg(null);
    setBusy('connect');
    try {
      if (wallet?.adapter.name !== name) {
        // WalletProvider has autoConnect on, so selecting a wallet connects it.
        select(name as Parameters<typeof select>[0]);
      } else if (!connected) {
        await connect();
      }
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  const paySol = async () => {
    if (!publicKey) return;
    const usd = Number(amount);
    if (!Number.isFinite(usd) || usd <= 0) { setMsg({ ok: false, text: 'Enter an amount in USD.' }); return; }
    setBusy('sol'); setMsg(null);
    try {
      const r = await topupSolWithWallet({ amountUsd: usd, ownerPubkey: publicKey.toBase58(), sendTransaction });
      setMsg({ ok: true, text: `Credited $${r.creditedUsd.toFixed(2)}. Transaction ${short(r.txSignature)}.` });
      onCredited();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally { setBusy(null); }
  };

  const creditUsdc = async () => {
    if (!sig.trim()) return;
    setBusy('usdc'); setMsg(null);
    try {
      const r = await creditUsdcTopup(sig.trim(), 'devnet', publicKey?.toBase58());
      setMsg({ ok: true, text: `Credited $${r.credited_usd.toFixed(2)}.` });
      setSig('');
      onCredited();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally { setBusy(null); }
  };

  return (
    <div className="two">
      <div>
        <h3>Wallet</h3>
        {connected && publicKey ? (
          <>
            <p className="note" style={{ margin: 0 }}>
              Connected with {wallet?.adapter.name}: <span className="mono" title={publicKey.toBase58()}>{short(publicKey.toBase58())}</span>
            </p>
            <div className="field">
              <button className="btn sm" onClick={() => void disconnect()}>Disconnect</button>
            </div>
          </>
        ) : (
          <>
            <p className="note" style={{ margin: 0 }}>
              Browser wallets that support the Wallet Standard (Phantom, Backpack, …) are found automatically. Solflare works as an extension or in its web wallet.
            </p>
            <div className="wallets">
              {ready.map((w) => (
                <button key={w.adapter.name} className="wallet" onClick={() => void pick(w.adapter.name)} disabled={busy === 'connect' || connecting}>
                  {w.adapter.icon && <img src={w.adapter.icon} alt="" />}
                  {w.adapter.name}
                  <small>{w.readyState === WalletReadyState.Installed ? 'detected' : 'web'}</small>
                </button>
              ))}
            </div>
            {ready.length === 0 && <p className="note">No browser wallet found in this browser.</p>}
            {missing.length > 0 && (
              <p className="note">
                Not installed:{' '}
                {missing.map((w, i) => (
                  <React.Fragment key={w.adapter.name}>
                    {i > 0 && ', '}
                    <a href={w.adapter.url} target="_blank" rel="noreferrer">{w.adapter.name}</a>
                  </React.Fragment>
                ))}
              </p>
            )}
          </>
        )}
        <p className="note">Payments run on Solana devnet.</p>
      </div>

      <div>
        <h3>Add funds</h3>
        <p className="note" style={{ margin: 0 }}>
          Pay in SOL from the connected wallet. The server quotes the SOL amount, you sign one transfer, and the balance is credited after the server verifies it on-chain.
        </p>
        <div className="field">
          <span className="mono">$</span>
          <input aria-label="Amount in USD" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 96 }} />
          <button className="btn dark" disabled={!connected || busy !== null} onClick={() => void paySol()}>
            {busy === 'sol' ? 'Waiting for wallet…' : 'Pay with SOL'}
          </button>
        </div>
        {!connected && <p className="note">Connect a wallet first.</p>}
        <p className="note" style={{ marginTop: 22, marginBottom: 0 }}>Already sent devnet USDC to KeyShield&apos;s payment address? Paste the transaction signature.</p>
        <div className="field">
          <input aria-label="USDC transaction signature" placeholder="Transaction signature" value={sig} onChange={(e) => setSig(e.target.value)} style={{ flex: '1 1 220px' }} />
          <button className="btn sm" disabled={!sig.trim() || busy !== null} onClick={() => void creditUsdc()}>
            {busy === 'usdc' ? 'Verifying…' : 'Credit'}
          </button>
        </div>
        {msg && <p className={msg.ok ? 'okmsg' : 'err'}>{msg.text}</p>}
      </div>
    </div>
  );
};
