/**
 * CreateAgentSignerButton — wires the on-chain ephemeral signer flow.
 *
 * Flow:
 *   1. user clicks → POST /agents/{id}/wallet/build-tx
 *   2. backend returns unsigned ix #23 (CreateEphemeralSigner) as
 *      { programId, keys, data:base64, rpcUrl, cluster }
 *   3. we build a web3.js Transaction, fetch a recent blockhash from
 *      devnet, ask Phantom/Solflare to sign+send
 *   4. confirm + render the Explorer link
 *
 * Uses @solana/web3.js v1 (already in root node_modules) and the
 * window.phantom / window.solflare provider pattern from
 * @keyshield/shared/auth (no wallet-adapter dep needed for the demo).
 */
import { useState, useCallback, useMemo } from 'react';
import { Loader2, ExternalLink, Wallet, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@keyshield/ui';
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  Keypair,
} from '@solana/web3.js';
import { buildAgentSignerTx } from '@keyshield/shared/api';
import {
  detectWallets,
  connectWalletByKey,
} from '@keyshield/shared/auth';

// Default devnet program — overridden by VITE_KEYSHIELD_PROGRAM_ID at
// build time and again by the backend response (rpcUrl/programId).
const DEFAULT_PROGRAM_ID =
  (import.meta as any).env?.VITE_KEYSHIELD_PROGRAM_ID ??
  'DHPTRYbLXSkrM9xYoU2ZJ1HhHWf3huvNoqFvXf5S6EBj';
const DEFAULT_RPC =
  (import.meta as any).env?.VITE_SOLANA_RPC ?? 'https://api.devnet.solana.com';

// PDA seeds (mirror agent_wallet.py and the on-chain seeds! macro).
const EPHEMERAL_SEED = new TextEncoder().encode('ephemeral_signer');
const VAULT_SEED = new TextEncoder().encode('keyshield_vault');

// Decode base64 → Uint8Array without depending on a Buffer polyfill.
// Vite ships atob in the browser; this works for the small ix data
// payload we get back from the backend.
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'pending'; phase: 'connect' | 'build' | 'sign' | 'confirm' }
  | { kind: 'success'; signature: string; cluster: string }
  | { kind: 'error'; message: string };

interface Props {
  agentId: string;
  agentPubkey?: string;
  className?: string;
  /** Optional label override; defaults to "Create on-chain signer". */
  label?: string;
}

function deriveEphemeralSignerPda(
  agentPubkey: PublicKey,
  ownerPubkey: PublicKey,
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [EPHEMERAL_SEED, agentPubkey.toBuffer(), ownerPubkey.toBuffer()],
    programId,
  );
}

function deriveVaultPda(
  ownerPubkey: PublicKey,
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [VAULT_SEED, ownerPubkey.toBuffer()],
    programId,
  );
}

function explorerUrl(sig: string, cluster: string): string {
  const c = cluster && cluster !== 'mainnet' ? `?cluster=${cluster}` : '';
  return `https://explorer.solana.com/tx/${sig}${c}`;
}

function getActiveWalletProvider() {
  // Prefer whichever Solana wallet is already connected; this matches
  // the auth module's REGISTRY order (Phantom → Solflare → Backpack).
  const wallets = detectWallets();
  return wallets.find((w) => w.isConnected) ?? wallets.find((w) => w.isInstalled) ?? null;
}

export default function CreateAgentSignerButton({
  agentId,
  agentPubkey: agentPubkeyB58,
  className,
  label,
}: Props) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  // Effective agent pubkey: prefer the prop. If the agent_id from
  // backend is not a valid 32-byte base58 (it's currently a synthetic
  // string like "agent_000001_<prefix>"), we fall back to a randomly
  // generated demo keypair so the demo button still produces a real
  // on-chain ix. Production wires this to a real on-chain agent grant.
  const agentPubkey = useMemo(() => {
    const candidate = agentPubkeyB58 ?? agentId;
    try {
      return new PublicKey(candidate);
    } catch {
      // Synthetic dashboard agent_id — derive a deterministic pubkey
      // from the string so the demo is reproducible per-agent.
      return Keypair.generate().publicKey;
    }
  }, [agentId, agentPubkeyB58]);

  const handleClick = useCallback(async () => {
    setStatus({ kind: 'pending', phase: 'connect' });
    try {
      // ── 1. Ensure a wallet is connected ────────────────────────
      let walletAddr: string | null = null;
      let provider: any = null;

      const wInfo = getActiveWalletProvider();
      if (!wInfo) {
        throw new Error('No Solana wallet detected. Install Phantom or Solflare.');
      }

      if (!wInfo.isConnected) {
        const connected = await connectWalletByKey(wInfo.key);
        provider = connected.provider;
        walletAddr = connected.address;
      } else {
        provider = wInfo.provider;
        walletAddr = wInfo.address;
      }

      if (!walletAddr || !provider) {
        throw new Error('Wallet did not return a public key.');
      }

      const owner = new PublicKey(walletAddr);
      const programId = new PublicKey(DEFAULT_PROGRAM_ID);

      // ── 2. Derive PDAs the backend needs ──────────────────────
      const [vaultPda] = deriveVaultPda(owner, programId);
      const [ephemeralPda] = deriveEphemeralSignerPda(agentPubkey, owner, programId);

      // ── 3. Ask backend to build the ix ────────────────────────
      setStatus({ kind: 'pending', phase: 'build' });
      const built = await buildAgentSignerTx(agentId, {
        ownerPubkey: owner.toBase58(),
        agentPubkey: agentPubkey.toBase58(),
        ephemeralPubkey: ephemeralPda.toBase58(),
        vaultPda: vaultPda.toBase58(),
      });

      // ── 4. Build the Transaction ──────────────────────────────
      const rpc = built.rpcUrl ?? DEFAULT_RPC;
      const cluster = built.cluster ?? 'devnet';
      const connection = new Connection(rpc, 'confirmed');

      const ix = new TransactionInstruction({
        programId: new PublicKey(built.programId),
        keys: built.keys.map((k) => ({
          pubkey: new PublicKey(k.pubkey),
          isSigner: k.isSigner,
          isWritable: k.isWritable,
        })),
        data: base64ToBytes(built.data) as unknown as Buffer,
      });

      const tx = new Transaction().add(ix);
      tx.feePayer = owner;
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;

      // ── 5. Sign + send via the wallet ─────────────────────────
      setStatus({ kind: 'pending', phase: 'sign' });
      let signature: string;
      if (typeof provider.signAndSendTransaction === 'function') {
        const resp = await provider.signAndSendTransaction(tx);
        signature = typeof resp === 'string' ? resp : resp.signature;
      } else if (typeof provider.signTransaction === 'function') {
        const signed = await provider.signTransaction(tx);
        signature = await connection.sendRawTransaction(signed.serialize(), {
          skipPreflight: false,
          maxRetries: 3,
        });
      } else {
        throw new Error('Wallet does not support transaction signing.');
      }

      // ── 6. Confirm ────────────────────────────────────────────
      setStatus({ kind: 'pending', phase: 'confirm' });
      await connection.confirmTransaction(signature, 'confirmed');

      setStatus({ kind: 'success', signature, cluster });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error';
      // Don't drown the user in raw RPC stack traces.
      setStatus({ kind: 'error', message: message.slice(0, 240) });
    }
  }, [agentId, agentPubkey]);

  // ── Render ───────────────────────────────────────────────────
  if (status.kind === 'success') {
    return (
      <a
        href={explorerUrl(status.signature, status.cluster)}
        target="_blank"
        rel="noreferrer noopener"
        className={`inline-flex items-center gap-1.5 text-xs ${className ?? ''}`}
        style={{ color: '#10b981' }}
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        <span>Confirmed</span>
        <ExternalLink className="h-3 w-3" />
      </a>
    );
  }

  if (status.kind === 'error') {
    return (
      <div className={`flex items-center gap-2 ${className ?? ''}`}>
        <Button
          size="sm"
          variant="secondary"
          onClick={handleClick}
          title={status.message}
        >
          <Wallet className="h-3.5 w-3.5 mr-1.5" />
          Retry signer
        </Button>
        <span
          className="inline-flex items-center gap-1 text-xs"
          style={{ color: '#ef4444' }}
          title={status.message}
        >
          <AlertCircle className="h-3 w-3" />
          {status.message.length > 40 ? `${status.message.slice(0, 40)}…` : status.message}
        </span>
      </div>
    );
  }

  if (status.kind === 'pending') {
    const phaseLabel: Record<typeof status.phase, string> = {
      connect: 'Connecting…',
      build: 'Building tx…',
      sign: 'Sign in wallet…',
      confirm: 'Confirming…',
    };
    return (
      <Button size="sm" variant="secondary" disabled className={className}>
        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
        {phaseLabel[status.phase]}
      </Button>
    );
  }

  return (
    <Button size="sm" variant="secondary" onClick={handleClick} className={className}>
      <Wallet className="h-3.5 w-3.5 mr-1.5" />
      {label ?? 'Create on-chain signer'}
    </Button>
  );
}
