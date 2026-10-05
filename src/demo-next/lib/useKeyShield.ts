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

export type { VaultState } from './vaultState';

export type FailKind = 'local-cancel' | 'local-error' | 'chain-failed' | 'pending' | null;

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
  const sessionKeyRef = useRef<CryptoKey | null>(null);
  const pendingSigRef = useRef<string | null>(null);
  const treeRef = useRef<CredentialMerkleTree>(new CredentialMerkleTree());

  const fail = useCallback((kind: FailKind, message: string) => {
    setFailKind(kind);
    setError(message);
    setState('FAILED');
  }, []);

  const resetPendingUi = useCallback(() => {
    if (pendingLocked) return;
    setError(null);
    setFailKind(null);
    setState('IDLE');
  }, [pendingLocked]);

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
        setState('IDLE');
      } catch (e) {
        if (e instanceof PasskeyCancelledError) {
          fail('local-cancel', 'Passkey cancelled — account unchanged');
          return;
        }
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
      setProof(null);
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
          setSettlement('clawback');
          setState('SETTLED');
          return;
        }

        const verified = await verifyUpstream(hid, upstream);
        if (!verified.ok) {
          abortHold(hid, verified.reason || 'unverified fulfillment');
          setSettlement('aborted');
          setLastTx(chainFeedback({ note: `${verified.reason} — no debit`, layer: 'none' }));
          fail('local-error', `${verified.reason || 'unverified fulfillment'} — no debit`);
          return;
        }

        if (opts.streamId) {
          setState('SUBMITTING_DEVNET');
          setPendingLocked(true);
          pendingSigRef.current = `pending:${hid}`;
          const meter = await tryDemoMeter(opts.streamId);
          setPendingLocked(false);
          pendingSigRef.current = null;
          if (!meter.ok) {
            abortHold(hid, meter.detail);
            setSettlement('aborted');
            setLastTx(chainFeedback({ note: `${meter.detail} — no debit`, layer: 'none' }));
            fail('chain-failed', `${meter.detail} — no debit`);
            return;
          }
          captureHold(hid);
          setSettlement('mpp-demo-meter');
          setLastTx(chainFeedback({ note: meter.detail, layer: 'mpp-demo-meter' }));
        } else {
          captureHold(hid);
          setSettlement('local-hold');
          setLastTx(
            chainFeedback({
              note: 'local hold captured — no Devnet signature (live 41P2wHK rejects ix 40)',
              layer: 'local-hold',
            }),
          );
        }
        setState('SETTLED');
      } catch (e) {
        setPendingLocked(false);
        if (e instanceof PasskeyCancelledError) {
          fail('local-cancel', 'Passkey cancelled — no proof, no debit');
          return;
        }
        if (e instanceof CircuitError) {
          fail('local-error', `circuit ${e.code}: ${e.message}`);
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
  };

  return {
    snapshot,
    decryptCredential,
    authorizeAgent,
    revoke,
    forceClawback,
    resetPendingUi,
    grantMeta,
  };
}
