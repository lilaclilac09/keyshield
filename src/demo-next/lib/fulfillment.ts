/**
 * Two-phase fulfillment: hold → verify artifact hash → capture | abort | clawback.
 *
 * Local machine first. Optional MPP demo-meter is a backend hop, not
 * Groth16 and not live `mpp_settle` / `settle_on_chain`. This module
 * never imports those paths.
 */

import { actionHashOf } from './zk';
import { toHex, zeroize } from './bytes';
import { ksFetch } from './ks';

export const DEFAULT_DISPUTE_TIMEOUT_SLOTS = 64n;

export type HoldStatus = 'in-flight' | 'captured' | 'aborted' | 'clawback';

export type UpstreamResult =
  | { kind: 'ok'; status: number; payload: string | Uint8Array }
  | { kind: 'http-error'; status: number }
  | { kind: 'empty' }
  | { kind: 'disconnect'; detail?: string }
  | { kind: 'timeout-clawback' };

export interface Hold {
  id: string;
  actionHash: string;
  amount: string;
  disputeTimeoutSlot: bigint;
  status: HoldStatus;
  reason?: string;
  verified: boolean;
  released: boolean;
  debit: string;
  refunded: boolean;
}

export interface PublicHold {
  id: string;
  actionHash: string;
  amount: string;
  disputeTimeoutSlot: string;
  status: HoldStatus;
  reason?: string;
  verified: boolean;
  released: boolean;
  debit: string;
  refunded: boolean;
}

export interface VerifyOutcome {
  ok: boolean;
  reason?: string;
  artifactHash?: string;
  released: boolean;
}

type Slot = Hold & { artifact?: Uint8Array };

const holds = new Map<string, Slot>();

function toBytes(payload: string | Uint8Array): Uint8Array {
  return typeof payload === 'string' ? new TextEncoder().encode(payload) : new Uint8Array(payload);
}

function isEmpty(payload: string | Uint8Array): boolean {
  if (typeof payload === 'string') return payload.length === 0 || payload.trim().length === 0;
  return payload.length === 0;
}

export function resetHolds(): void {
  for (const slot of holds.values()) {
    if (slot.artifact) zeroize(slot.artifact);
  }
  holds.clear();
}

export function openHold(input: {
  id: string;
  actionHash: string;
  amount: string;
  nowSlot: bigint;
  timeoutSlots?: bigint;
}): PublicHold {
  const hold: Slot = {
    id: input.id,
    actionHash: input.actionHash,
    amount: input.amount,
    disputeTimeoutSlot: input.nowSlot + (input.timeoutSlots ?? DEFAULT_DISPUTE_TIMEOUT_SLOTS),
    status: 'in-flight',
    verified: false,
    released: false,
    debit: '0',
    refunded: false,
  };
  holds.set(hold.id, hold);
  return publicOf(hold);
}

function publicOf(hold: Slot): PublicHold {
  return {
    id: hold.id,
    actionHash: hold.actionHash,
    amount: hold.amount,
    disputeTimeoutSlot: hold.disputeTimeoutSlot.toString(),
    status: hold.status,
    reason: hold.reason,
    verified: hold.verified,
    released: hold.released,
    debit: hold.debit,
    refunded: hold.refunded,
  };
}

export function getHold(id: string): PublicHold | undefined {
  const hold = holds.get(id);
  return hold ? publicOf(hold) : undefined;
}

export function listHolds(): PublicHold[] {
  return [...holds.values()].map(publicOf);
}

export function upstreamFromMethod(method: string, matchingPayload: string): UpstreamResult {
  if (method === 'fulfill.502') return { kind: 'http-error', status: 502 };
  if (method === 'fulfill.empty') return { kind: 'empty' };
  if (method === 'fulfill.disconnect') return { kind: 'disconnect', detail: 'socket closed' };
  if (method === 'fulfill.mismatch') return { kind: 'ok', status: 200, payload: `${matchingPayload}|tampered` };
  if (method === 'fulfill.clawback') return { kind: 'timeout-clawback' };
  return { kind: 'ok', status: 200, payload: matchingPayload };
}

export async function verifyUpstream(holdId: string, result: UpstreamResult): Promise<VerifyOutcome> {
  const hold = holds.get(holdId);
  if (!hold || hold.status !== 'in-flight') {
    return { ok: false, reason: 'no in-flight hold', released: false };
  }
  if (result.kind === 'timeout-clawback') {
    return { ok: false, reason: 'dispute_timeout', released: false };
  }
  if (result.kind === 'disconnect') {
    return { ok: false, reason: 'upstream disconnect', released: false };
  }
  if (result.kind === 'http-error' || (result.kind === 'ok' && (result.status < 200 || result.status >= 300))) {
    const status = result.kind === 'http-error' ? result.status : result.status;
    return { ok: false, reason: `upstream HTTP ${status}`, released: false };
  }
  if (result.kind === 'empty' || (result.kind === 'ok' && isEmpty(result.payload))) {
    return { ok: false, reason: 'empty payload', released: false };
  }
  if (result.kind !== 'ok') {
    return { ok: false, reason: 'unverified fulfillment', released: false };
  }

  const bytes = toBytes(result.payload);
  const artifactHash = toHex(await actionHashOf(bytes));
  if (artifactHash !== hold.actionHash) {
    return { ok: false, reason: 'artifact hash mismatch', artifactHash, released: false };
  }
  if (hold.artifact) zeroize(hold.artifact);
  hold.artifact = bytes;
  hold.verified = true;
  hold.released = true;
  return { ok: true, artifactHash, released: true };
}

/** Happy-path wrapper: sha256(payload) must equal the hold action_hash. */
export async function verifyArtifact(holdId: string, payload: string | Uint8Array): Promise<boolean> {
  const out = await verifyUpstream(holdId, { kind: 'ok', status: 200, payload });
  return out.ok;
}

/** Copy released artifact. Caller must zeroize. Missing / not verified → null. */
export function takeReleasedArtifact(holdId: string): Uint8Array | null {
  const hold = holds.get(holdId);
  if (!hold?.released || !hold.artifact) return null;
  return new Uint8Array(hold.artifact);
}

export function captureHold(holdId: string): PublicHold | null {
  const hold = holds.get(holdId);
  if (!hold || hold.status !== 'in-flight' || !hold.verified || !hold.released) return null;
  hold.status = 'captured';
  hold.debit = hold.amount;
  return publicOf(hold);
}

export function abortHold(holdId: string, reason: string): PublicHold | null {
  const hold = holds.get(holdId);
  if (!hold || hold.status !== 'in-flight') return null;
  hold.status = 'aborted';
  hold.reason = reason;
  hold.debit = '0';
  hold.released = false;
  hold.verified = false;
  if (hold.artifact) {
    zeroize(hold.artifact);
    hold.artifact = undefined;
  }
  return publicOf(hold);
}

export function clawbackHold(holdId: string, nowSlot: bigint): PublicHold | null {
  const hold = holds.get(holdId);
  if (!hold || hold.status !== 'in-flight') return null;
  if (nowSlot <= hold.disputeTimeoutSlot) return null;
  hold.status = 'clawback';
  hold.reason = 'dispute_timeout';
  hold.debit = '0';
  hold.refunded = true;
  hold.released = false;
  if (hold.artifact) {
    zeroize(hold.artifact);
    hold.artifact = undefined;
  }
  return publicOf(hold);
}

/** Client-layer timeout check. Does not submit on-chain ix #28. */
export function forceClawbackReady(holdId: string, nowSlot: bigint): boolean {
  const hold = holds.get(holdId);
  if (!hold || hold.status !== 'in-flight') return false;
  return nowSlot > hold.disputeTimeoutSlot;
}

/**
 * Optional backend hop after local verify. Not live `mpp_settle`.
 * HTTP failure here must abort — no debit.
 */
export async function tryDemoMeter(
  streamId: number,
): Promise<{ ok: boolean; detail: string; signature?: string }> {
  try {
    const r = await ksFetch(`/mpp/streams/${streamId}/demo-meter`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    if (!r.ok) return { ok: false, detail: `demo-meter HTTP ${r.status}` };
    let signature: string | undefined;
    try {
      const body = (await r.json()) as { signature?: string; tx?: string };
      signature = body.signature || body.tx;
    } catch {
      /* body optional */
    }
    return { ok: true, detail: 'mpp demo-meter accepted (not mpp_settle, not Groth16)', signature };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}
