'use client';

import { useCallback, useRef, useState } from 'react';
import { decryptManaged } from './ks';
import { encryptToStore, decryptFromStore } from './cipher';
import { grantMeta, putGrant, revokeAllGrants, revokeGrant } from './grant';
import { PasskeyCancelledError, runClientPrf, type PublicPrfView } from './prf';
import {
  CircuitError,
  CredentialMerkleTree,
  consumeWitness,
  generateAuthorizationProof,
  type AuthorizationProof,
} from './zk';
import { te } from './bytes';
import { abortHold, captureHold, openHold, tryDemoMeter, verifyArtifact } from './fulfillment';

export type VaultState =
  | 'IDLE'
  | 'AWAITING_PASSKEY'
  | 'GENERATING_PROOF'
  | 'HOLDING'
  | 'SUBMITTING_DEVNET'
  | 'SETTLED'
  | 'FAILED';

export type FailKind = 'local-cancel' | 'local-error' | 'chain-failed' | 'pending' | null;

export interface KeyShieldSnapshot {
  state: VaultState;
  failKind: FailKind;
  error: string | null;
  prf: PublicPrfView | null;
  proof: AuthorizationProof | null;
  pasted: Record<string, boolean>;
  holdId: string | null;
  settlement: 'none' | 'local-hold' | 'mpp-demo-meter';
  pendingLocked: boolean;
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
        await encryptToStore(derived.sessionKey, row.id, plain);
        const unlocked = await decryptFromStore(derived.sessionKey, row.id);
        if (!unlocked) throw new Error('local decrypt failed');

        if (mode === 'human') {
          try {
            await navigator.clipboard.writeText(unlocked);
          } catch {
            /* clipboard may be blocked */
          }
          setPasted((p) => ({ ...p, [row.id]: true }));
        } else {
          putGrant(row.id, unlocked, 300_000);
        }
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

        const ok = await verifyArtifact(hid, payload);
        if (!ok) {
          abortHold(hid, 'artifact hash mismatch');
          fail('local-error', 'artifact hash mismatch — no debit');
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
            fail('chain-failed', meter.detail);
            return;
          }
          captureHold(hid);
          setSettlement('mpp-demo-meter');
        } else {
          captureHold(hid);
          setSettlement('local-hold');
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

  const snapshot: KeyShieldSnapshot = {
    state,
    failKind,
    error,
    prf,
    proof,
    pasted,
    holdId,
    settlement,
    pendingLocked,
  };

  return {
    snapshot,
    decryptCredential,
    authorizeAgent,
    revoke,
    resetPendingUi,
    grantMeta,
  };
}
