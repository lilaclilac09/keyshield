import assert from 'node:assert/strict';
import {
  abortHold,
  captureHold,
  clawbackHold,
  forceClawbackReady,
  getHold,
  openHold,
  resetHolds,
  takeReleasedArtifact,
  upstreamFromMethod,
  verifyArtifact,
  verifyUpstream,
} from './fulfillment';
import { actionHashOf } from './zk';
import { toHex, zeroize } from './bytes';

async function main() {
  resetHolds();
  const payload = JSON.stringify({ method: 'mpp.meter', agentId: 'demo-agent', spendCap: '5000' });
  const actionHash = toHex(await actionHashOf(payload));

  const hold = openHold({
    id: 'hold-1',
    actionHash,
    amount: '5000',
    nowSlot: 100n,
    timeoutSlots: 64n,
  });
  assert.equal(hold.status, 'in-flight');
  assert.equal(hold.debit, '0');
  assert.equal(hold.disputeTimeoutSlot, '164');
  assert.equal(hold.released, false);

  assert.equal(await verifyArtifact('hold-1', payload), true);
  const afterVerify = getHold('hold-1');
  assert.equal(afterVerify?.verified, true);
  assert.equal(afterVerify?.released, true);
  assert.equal(afterVerify?.debit, '0');
  const released = takeReleasedArtifact('hold-1');
  assert.ok(released);
  assert.equal(new TextDecoder().decode(released), payload);
  zeroize(released);

  const captured = captureHold('hold-1');
  assert.equal(captured?.status, 'captured');
  assert.equal(captured?.debit, '5000');

  resetHolds();
  openHold({ id: 'hold-mismatch', actionHash, amount: '5000', nowSlot: 10n });
  const mismatch = await verifyUpstream(
    'hold-mismatch',
    upstreamFromMethod('fulfill.mismatch', payload),
  );
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.reason, 'artifact hash mismatch');
  abortHold('hold-mismatch', mismatch.reason || 'mismatch');
  assert.equal(getHold('hold-mismatch')?.status, 'aborted');
  assert.equal(getHold('hold-mismatch')?.debit, '0');
  assert.equal(captureHold('hold-mismatch'), null);

  resetHolds();
  openHold({ id: 'hold-502', actionHash, amount: '9', nowSlot: 10n });
  const http502 = await verifyUpstream('hold-502', { kind: 'http-error', status: 502 });
  assert.equal(http502.ok, false);
  assert.equal(http502.reason, 'upstream HTTP 502');
  abortHold('hold-502', http502.reason || '502');
  assert.equal(getHold('hold-502')?.debit, '0');

  resetHolds();
  openHold({ id: 'hold-empty', actionHash, amount: '9', nowSlot: 10n });
  const empty = await verifyUpstream('hold-empty', { kind: 'empty' });
  assert.equal(empty.ok, false);
  assert.equal(empty.reason, 'empty payload');
  const zero = await verifyUpstream('hold-empty', { kind: 'ok', status: 200, payload: new Uint8Array() });
  assert.equal(zero.ok, false);

  resetHolds();
  openHold({ id: 'hold-net', actionHash, amount: '9', nowSlot: 10n });
  const down = await verifyUpstream('hold-net', { kind: 'disconnect', detail: 'ECONNRESET' });
  assert.equal(down.ok, false);
  assert.equal(down.reason, 'upstream disconnect');
  abortHold('hold-net', down.reason || 'disconnect');
  assert.equal(getHold('hold-net')?.status, 'aborted');
  assert.equal(getHold('hold-net')?.debit, '0');

  resetHolds();
  openHold({ id: 'hold-early', actionHash, amount: '12', nowSlot: 50n, timeoutSlots: 64n });
  assert.equal(forceClawbackReady('hold-early', 114n), false);
  assert.equal(clawbackHold('hold-early', 114n), null);
  assert.equal(getHold('hold-early')?.status, 'in-flight');
  assert.equal(forceClawbackReady('hold-early', 115n), true);
  const refunded = clawbackHold('hold-early', 115n);
  assert.equal(refunded?.status, 'clawback');
  assert.equal(refunded?.reason, 'dispute_timeout');
  assert.equal(refunded?.debit, '0');
  assert.equal(refunded?.refunded, true);
  assert.equal(captureHold('hold-early'), null);

  resetHolds();
  openHold({ id: 'hold-unverified', actionHash, amount: '1', nowSlot: 1n });
  assert.equal(captureHold('hold-unverified'), null, 'capture requires verified artifact');
  assert.equal(getHold('hold-unverified')?.debit, '0');

  console.log('fulfillment hold/verify/abort/clawback ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
