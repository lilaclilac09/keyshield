import assert from 'node:assert/strict';
import {
  VAULT_STATES,
  canRetryUi,
  canTransition,
  chainFeedback,
  explorerTxUrl,
  formatLatencyMs,
} from './vaultState';

function main() {
  assert.deepEqual(VAULT_STATES, [
    'IDLE',
    'AWAITING_PASSKEY',
    'GENERATING_PROOF',
    'HOLDING',
    'SUBMITTING_DEVNET',
    'SETTLED',
    'FAILED',
  ]);

  assert.equal(canTransition('IDLE', 'AWAITING_PASSKEY'), true);
  assert.equal(canTransition('AWAITING_PASSKEY', 'GENERATING_PROOF'), true);
  assert.equal(canTransition('GENERATING_PROOF', 'HOLDING'), true);
  assert.equal(canTransition('HOLDING', 'SUBMITTING_DEVNET'), true);
  assert.equal(canTransition('SUBMITTING_DEVNET', 'SETTLED'), true);
  assert.equal(canTransition('SUBMITTING_DEVNET', 'FAILED'), true);
  assert.equal(canTransition('SETTLED', 'IDLE'), true);
  assert.equal(canTransition('FAILED', 'IDLE'), true);
  assert.equal(canTransition('IDLE', 'SETTLED'), false, 'no optimistic jump to SETTLED');
  assert.equal(canTransition('SETTLED', 'SUBMITTING_DEVNET'), false);

  assert.equal(formatLatencyMs(42), '42ms');
  assert.equal(formatLatencyMs(null), '…');

  const url = explorerTxUrl('AbcSig111');
  assert.equal(url.includes('AbcSig111'), true);
  assert.equal(url.includes('cluster=devnet'), true);

  const local = chainFeedback({ note: 'local hold captured', layer: 'local-hold' });
  assert.equal(local.explorer, null);
  assert.equal(local.signature, null);

  const live = chainFeedback({ signature: 'SigDev', note: 'landed', layer: 'devnet' });
  assert.ok(live.explorer?.includes('SigDev'));

  assert.equal(canRetryUi('FAILED', false), true);
  assert.equal(canRetryUi('FAILED', true), false);
  assert.equal(canRetryUi('SETTLED', false), false);

  console.log('vault state machine ok');
}

main();
