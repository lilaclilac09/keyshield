'use client';

import { useCallback, useRef, useState } from 'react';
import { decryptManaged } from './ks';
import { encryptToStoreBytes, decryptFromStoreBytes } from './cipher';
import { GRANT_TTL_MS, grantMeta, listGrantMeta, putGrantBytes, revokeAllGrants, revokeGrant } from './grant';
import { zeroize } from './bytes';
import { PasskeyCancelledError, runClientPrf, type PublicPrfView } from './prf';
import {
  CircuitError,
  CredentialMerkleTree,
  consumeWitness,
  generateAuthorizationProof,
  type AuthorizationProof,
} from './zk';
import { te } from './bytes';
import {
  abortHold,
  captureHold,
  clawbackHold,
  forceClawbackReady,
  getHold,
  openHold,
  tryDemoMeter,
  upstreamFromMethod,
  verifyUpstream,
  type PublicHold,
} from './fulfillment';
import { signalPasskeySuccess } from './feedback';
import { chainFeedback, type ChainFeedback, type VaultState } from './vaultState';
import { pollSignatureStatus, type SigConfirmation } from './rpc-ping';
import {
  emptyBreakpoint,
  formatBreakpoint,
  isWalletReject,
  markBreakpoint,
  parseChainError,
  type FailKind,
  type FlowBreakpoint,
  type ParsedChainError,
  type RollbackKind,
} from './errors';
import { isMasterWalletMaterial } from './trust';

export type { VaultState } from './vaultState';
export type { FailKind, RollbackKind } from './errors';

export interface KeyShieldSnapshot {
  state: VaultState;
  failKind: FailKind;
  error: string | null;
  prf: PublicPrfView | null;
  proof: AuthorizationProof | null;
  pasted: Record<string, boolean>;
  grants: Array<{ id: string; ttlMs: number; upstream: string }>;
  holdId: string | null;
  hold: PublicHold | null;
  settlement: 'none' | 'local-hold' | 'mpp-demo-meter' | 'aborted' | 'clawback';
  pendingLocked: boolean;
  lastTx: ChainFeedback;
  rollbackKind: RollbackKind;
  breakpoint: FlowBreakpoint;
  breakpointLine: string;
  confirmation: SigConfirmation | null;
  chainError: ParsedChainError | null;
}

const PROXY_GRANT = (upstream: string) => `https://api.ks.local/vproxy/${upstream}/`;

export function useKeyShield() {
  const [state, setState] = useState<VaultState>('IDLE');
  const [failKind, setFailKind] = useState<FailKind>(null);
  const [error, setError] = useState<string | null>(null);
  const [prf, setPrf] = useState<PublicPrfView | null>(null);
  const [proof, setProof] = useState<AuthorizationProof | null>(null);
  const [pasted, setPasted] = useState<Record<string, boolean>>({});
  const [holdId, setHoldId] = useState<string | null>(null);
  const [settlement, setSettlement] = useState<KeyShieldSnapshot['settlement']>('none');
  const [pendingLocked, setPendingLocked] = useState(false);
  const [lastTx, setLastTx] = useState<ChainFeedback>(chainFeedback({ note: 'idle', layer: 'none' }));
  const [rollbackKind, setRollbackKind] = useState<RollbackKind>(null);
  const [breakpoint, setBreakpoint] = useState<FlowBreakpoint>(emptyBreakpoint());
  const [confirmation, setConfirmation] = useState<SigConfirmation | null>(null);
  const [chainError, setChainError] = useState<ParsedChainError | null>(null);
  const sessionKeyRef = useRef<CryptoKey | null>(null);
  const pendingSigRef = useRef<string | null>(null);
  const treeRef = useRef<CredentialMerkleTree>(new CredentialMerkleTree());

  const fail = useCallback((kind: FailKind, message: string) => {
    setFailKind(kind);
    setError(message);
    setState('FAILED');
  }, []);

  const resetPendingUi = useCallback(() => {
    if (pendingLocked || confirmation === 'unknown') return;
    setError(null);
    setFailKind(null);
    setRollbackKind(null);
    setChainError(null);
    setBreakpoint(emptyBreakpoint());
    setState('IDLE');
  }, [pendingLocked, confirmation]);

  const decryptCredential = useCallback(
    async (row: { id: string; upstream: string; stored: boolean }, mode: 'human' | 'agent') => {
      if (pendingLocked) return;
      setError(null);
      setFailKind(null);
      setState('AWAITING_PASSKEY');
      try {
        const derived = await runClientPrf({ allowDemoSoft: true });
        sessionKeyRef.current = derived.sessionKey;
        setPrf(derived.view);

        let plain = PROXY_GRANT(row.upstream);
        if (row.stored) {
          const remote = await decryptManaged(row.id);
          if (remote) plain = remote;
        }
        if (isMasterWalletMaterial(plain)) {
          throw new Error('refusing master wallet material — session keypair only');
        }
        const wrap = new TextEncoder().encode(plain);
        await encryptToStoreBytes(derived.sessionKey, row.id, wrap);
        zeroize(wrap);
        const unlocked = await decryptFromStoreBytes(derived.sessionKey, row.id);
        if (!unlocked) throw new Error('local decrypt failed');

        if (mode === 'human') {
          const text = new TextDecoder().decode(unlocked);
          try {
            await navigator.clipboard.writeText(text);
          } catch {
            /* clipboard may be blocked */
          }
          setPasted((p) => ({ ...p, [row.id]: true }));
          signalPasskeySuccess();
        } else {
          putGrantBytes(row.id, unlocked, { ttlMs: GRANT_TTL_MS, upstream: row.upstream });
          signalPasskeySuccess();
        }
        zeroize(unlocked);
        consumeWitness(derived.witness);
        setBreakpoint(markBreakpoint(['passkey', 'decrypt'], '', ''));
        setState('IDLE');
      } catch (e) {
        if (e instanceof PasskeyCancelledError || isWalletReject(e)) {
          setRollbackKind('local-cancel');
          setBreakpoint(markBreakpoint([], 'passkey', 'wallet reject / timeout'));
          fail('local-cancel', 'wallet reject / timeout — account & policy unchanged');
          return;
        }
        setRollbackKind('local-cancel');
        fail('local-error', e instanceof Error ? e.message : String(e));
      }
    },
    [fail, pendingLocked],
  );

  const authorizeAgent = useCallback(
    async (opts: {
      method: string;
      agentId: string;
      spendCap: bigint;
      slot: bigint;
      streamId?: number;
    }) => {
      if (pendingLocked) return;
      setError(null);
      setFailKind(null);
      setRollbackKind(null);
      setChainError(null);
      setProof(null);
      setConfirmation(null);
      setState('AWAITING_PASSKEY');
      try {
        const derived = await runClientPrf({ allowDemoSoft: true });
        sessionKeyRef.current = derived.sessionKey;
        setPrf(derived.view);

        setState('GENERATING_PROOF');
        try {
          await treeRef.current.proveHex(derived.view.prfCommitment);
        } catch {
          await treeRef.current.insertHex(derived.view.prfCommitment);
        }
        if (treeRef.current.size < 3) {
          const pad = te(`ks-pad:${treeRef.current.size}:${derived.view.vaultId}`);
          const digest = await crypto.subtle.digest('SHA-256', pad);
          treeRef.current.insert(new Uint8Array(digest));
        }
        const payload = JSON.stringify({
          method: opts.method,
          agentId: opts.agentId,
          spendCap: opts.spendCap.toString(),
        });
        const cred = te(`ks-session-cred:${derived.view.vaultId}:${opts.agentId}`);
        const nextProof = await generateAuthorizationProof({
          secret: derived.witness,
          prfCommitment: derived.view.prfCommitment,
          credentialPlain: cred,
          agentId: opts.agentId,
          actionPayload: payload,
          amount: opts.spendCap,
          spendCap: opts.spendCap,
          nowSlot: opts.slot,
          validUntilSlot: opts.slot + 150n,
          tree: treeRef.current,
        });
        putGrantBytes(`session:${opts.agentId}`, cred, { ttlMs: GRANT_TTL_MS, upstream: 'session' });
        consumeWitness(derived.witness);
        cred.fill(0);
        setProof(nextProof);

        const hid = `hold-${Date.now()}`;
        setState('HOLDING');
        openHold({
          id: hid,
          actionHash: nextProof.publicInputs.actionHash,
          amount: opts.spendCap.toString(),
          nowSlot: opts.slot,
        });
        setHoldId(hid);

        const upstream = upstreamFromMethod(opts.method, payload);
        if (upstream.kind === 'timeout-clawback') {
          const refunded = clawbackHold(hid, opts.slot + 65n);
          if (!refunded) {
            fail('local-error', 'DisputeWindowActive — no clawback');
            return;
          }
          setLastTx(chainFeedback({ note: 'force_clawback refund — local, not ix #28', layer: 'local-hold' }));
          setBreakpoint(markBreakpoint(['passkey', 'proof', 'hold'], '', 'clawback refund'));
          setSettlement('clawback');
          setState('SETTLED');
          return;
        }

        const verified = await verifyUpstream(hid, upstream);
        if (!verified.ok) {
          abortHold(hid, verified.reason || 'unverified fulfillment');
          setSettlement('aborted');
          setLastTx(chainFeedback({ note: `${verified.reason} — no debit`, layer: 'none' }));
          setBreakpoint(markBreakpoint(['passkey', 'proof', 'hold'], 'verify', verified.reason || 'mismatch'));
          fail('local-error', `${verified.reason || 'unverified fulfillment'} — no debit · not full-flow success`);
          return;
        }

        if (opts.streamId) {
          setState('SUBMITTING_DEVNET');
          setPendingLocked(true);
          const meter = await tryDemoMeter(opts.streamId);
          if (!meter.ok) {
            abortHold(hid, meter.detail);
            setSettlement('aborted');
            setPendingLocked(false);
            pendingSigRef.current = null;
            setLastTx(chainFeedback({ note: `${meter.detail} — no debit`, layer: 'none' }));
            setBreakpoint(markBreakpoint(['passkey', 'proof', 'hold', 'verify'], 'submit', meter.detail));
            const parsed = parseChainError(meter.detail);
            setChainError(parsed);
            setProof(null);
            fail('chain-failed', `${parsed.message} — ${meter.detail} — no debit`);
            return;
          }
          if (meter.signature) {
            pendingSigRef.current = meter.signature;
            setLastTx(chainFeedback({ signature: meter.signature, note: meter.detail, layer: 'devnet' }));
            setFailKind('pending');
            setError(`pending ${meter.signature} — retry locked, polling RPC`);
            setConfirmation('unknown');
            const st = await pollSignatureStatus(meter.signature);
            setConfirmation(st);
            if (st === 'unknown') {
              setBreakpoint(markBreakpoint(['passkey', 'proof', 'hold', 'verify', 'submit'], 'confirm', 'confirmation unknown'));
              return;
            }
            if (st === 'failed') {
              setPendingLocked(false);
              const parsed = parseChainError(meter.detail);
              setChainError(parsed);
              setProof(null);
              setRollbackKind('chain-rollback');
              setBreakpoint(markBreakpoint(['passkey', 'proof', 'hold', 'verify', 'submit'], 'confirm', parsed.name));
              fail('chain-failed', parsed.message);
              return;
            }
            setPendingLocked(false);
            pendingSigRef.current = null;
          } else {
            setPendingLocked(false);
            pendingSigRef.current = null;
          }
          captureHold(hid);
          setSettlement('mpp-demo-meter');
          setLastTx(
            chainFeedback({
              signature: meter.signature,
              note: meter.detail,
              layer: meter.signature ? 'devnet' : 'mpp-demo-meter',
            }),
          );
          setBreakpoint(markBreakpoint(['passkey', 'proof', 'hold', 'verify', 'submit'], '', ''));
        } else {
          captureHold(hid);
          setSettlement('local-hold');
          setLastTx(
            chainFeedback({
              note: 'local hold captured — no Devnet signature (live 41P2wHK rejects ix 40)',
              layer: 'local-hold',
            }),
          );
          setBreakpoint(markBreakpoint(['passkey', 'proof', 'hold', 'verify'], '', 'local capture'));
        }
        setState('SETTLED');
      } catch (e) {
        if (pendingSigRef.current) {
          setPendingLocked(true);
          setConfirmation('unknown');
          setFailKind('pending');
          setError(`pending ${pendingSigRef.current} — retry locked`);
          return;
        }
        setPendingLocked(false);
        if (e instanceof PasskeyCancelledError || isWalletReject(e)) {
          setRollbackKind('local-cancel');
          setBreakpoint(markBreakpoint([], 'passkey', 'wallet reject / timeout'));
          fail('local-cancel', 'wallet reject / timeout — account & policy unchanged');
          return;
        }
        if (e instanceof CircuitError) {
          setRollbackKind('local-cancel');
          setBreakpoint(markBreakpoint(['passkey'], 'proof', e.code));
          fail('local-error', `circuit ${e.code}: ${e.message}`);
          return;
        }
        const parsed = parseChainError(e);
        if (parsed.code != null) {
          setChainError(parsed);
          setProof(null);
          setRollbackKind('chain-rollback');
          fail('chain-failed', parsed.message);
          return;
        }
        fail('local-error', e instanceof Error ? e.message : String(e));
      }
    },
    [fail, pendingLocked],
  );

  const revoke = useCallback((id?: string) => {
    if (id) revokeGrant(id);
    else revokeAllGrants();
    setRollbackKind('grant-revoke');
  }, []);

  const forceClawback = useCallback(
    (nowSlot: bigint) => {
      if (!holdId) return;
      const current = getHold(holdId);
      if (!current || current.status !== 'in-flight') return;
      if (!forceClawbackReady(holdId, nowSlot)) {
        fail('local-error', 'DisputeWindowActive — escrow stays in-flight');
        return;
      }
      const refunded = clawbackHold(holdId, nowSlot);
      if (!refunded) {
        fail('local-error', 'clawback failed — hold not in-flight');
        return;
      }
      setLastTx(chainFeedback({ note: 'force_clawback refund — local, not ix #28', layer: 'local-hold' }));
      setSettlement('clawback');
      setState('SETTLED');
    },
    [fail, holdId],
  );

  const snapshot: KeyShieldSnapshot = {
    state,
    failKind,
    error,
    prf,
    proof,
    pasted,
    grants: listGrantMeta(),
    holdId,
    hold: holdId ? getHold(holdId) ?? null : null,
    settlement,
    pendingLocked,
    lastTx,
    rollbackKind,
    breakpoint,
    breakpointLine: formatBreakpoint(breakpoint),
    confirmation,
    chainError,
  };

  const pollPending = useCallback(async () => {
    const sig = pendingSigRef.current || lastTx.signature;
    if (!sig || !pendingLocked) return;
    const st = await pollSignatureStatus(sig);
    setConfirmation(st);
    if (st === 'confirmed') {
      setPendingLocked(false);
      pendingSigRef.current = null;
      setFailKind(null);
      setError(null);
      setState('SETTLED');
      return;
    }
    if (st === 'failed') {
      setPendingLocked(false);
      const parsed = parseChainError('on-chain execution failed');
      setChainError(parsed);
      setProof(null);
      setRollbackKind('chain-rollback');
      fail('chain-failed', parsed.message);
    }
  }, [fail, lastTx.signature, pendingLocked]);

  return {
    snapshot,
    decryptCredential,
    authorizeAgent,
    revoke,
    forceClawback,
    resetPendingUi,
    pollPending,
    grantMeta,
  };
}
