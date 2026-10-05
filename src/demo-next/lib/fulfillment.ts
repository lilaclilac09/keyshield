/**
 * Two-phase fulfillment: hold → verify artifact hash → capture | clawback.
 * Local machine first. Optional MPP demo-meter is a backend hop, not Groth16.
 */

import { actionHashOf } from './zk';
import { toHex } from './bytes';
import { ksFetch } from './ks';

export type HoldStatus = 'in-flight' | 'captured' | 'aborted' | 'clawback';

export interface Hold {
  id: string;
  actionHash: string;
  amount: string;
  disputeTimeoutSlot: bigint;
  status: HoldStatus;
  reason?: string;
}

const holds = new Map<string, Hold>();

export function openHold(input: {
  id: string;
  actionHash: string;
  amount: string;
  nowSlot: bigint;
  timeoutSlots?: bigint;
}): Hold {
  const hold: Hold = {
    id: input.id,
    actionHash: input.actionHash,
    amount: input.amount,
    disputeTimeoutSlot: input.nowSlot + (input.timeoutSlots ?? 64n),
    status: 'in-flight',
  };
  holds.set(hold.id, hold);
  return hold;
}

export async function verifyArtifact(holdId: string, payload: string): Promise<boolean> {
  const hold = holds.get(holdId);
  if (!hold || hold.status !== 'in-flight') return false;
  const got = toHex(await actionHashOf(payload));
  return got === hold.actionHash;
}

export function captureHold(holdId: string): Hold | null {
  const hold = holds.get(holdId);
  if (!hold || hold.status !== 'in-flight') return null;
  hold.status = 'captured';
  return hold;
}

export function abortHold(holdId: string, reason: string): Hold | null {
  const hold = holds.get(holdId);
  if (!hold || hold.status !== 'in-flight') return null;
  hold.status = 'aborted';
  hold.reason = reason;
  return hold;
}

export function clawbackHold(holdId: string, nowSlot: bigint): Hold | null {
  const hold = holds.get(holdId);
  if (!hold || hold.status !== 'in-flight') return null;
  if (nowSlot <= hold.disputeTimeoutSlot) return null;
  hold.status = 'clawback';
  hold.reason = 'dispute_timeout';
  return hold;
}

export function getHold(id: string): Hold | undefined {
  return holds.get(id);
}

export async function tryDemoMeter(streamId: number): Promise<{ ok: boolean; detail: string }> {
  try {
    const r = await ksFetch(`/mpp/streams/${streamId}/demo-meter`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    if (!r.ok) return { ok: false, detail: `demo-meter HTTP ${r.status}` };
    return { ok: true, detail: 'mpp demo-meter accepted (not Groth16)' };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}
