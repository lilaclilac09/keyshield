import assert from 'node:assert/strict';
import {
  ROLLBACK_LABEL,
  canRetryUi,
  formatBreakpoint,
  markBreakpoint,
  parseChainError,
  shouldLockRetry,
} from './errors';
import { TRUST, isMasterWalletMaterial } from './trust';

function main() {
  const cap = parseChainError(new Error('custom program error: 0x17e6'));
  assert.equal(cap.code, 6118);
  assert.equal(cap.name, 'CapExceeded');
  assert.equal(cap.message.includes('draft'), true);

  const named = parseChainError('Anchor Error Code: NullifierUsed');
  assert.equal(named.name, 'NullifierUsed');
  assert.equal(named.code, 6117);

  const mint = parseChainError('CounterfeitMint');
  assert.equal(mint.name, 'InvalidMint');

  assert.equal(shouldLockRetry(true, null), true);
  assert.equal(shouldLockRetry(false, 'unknown'), true);
  assert.equal(shouldLockRetry(false, 'failed'), false);
  assert.equal(canRetryUi('FAILED', false), true);
  assert.equal(canRetryUi('FAILED', true), false);
  assert.equal(canRetryUi('FAILED', false, 'unknown'), false);

  const bp = markBreakpoint(['passkey', 'proof', 'hold'], 'verify', 'artifact hash mismatch');
  const line = formatBreakpoint(bp);
  assert.equal(line.includes('passkey:ok'), true);
  assert.equal(line.includes('verify:FAIL'), true);
  assert.equal(line.includes('全流程') || line.toLowerCase().includes('success'), false);

  assert.notEqual(ROLLBACK_LABEL['local-cancel'], ROLLBACK_LABEL['chain-rollback']);
  assert.notEqual(ROLLBACK_LABEL['grant-revoke'], ROLLBACK_LABEL['chain-rollback']);
  assert.equal(ROLLBACK_LABEL['chain-rollback'].includes('new signed tx'), true);

  assert.equal(TRUST.passkeyLayer, 'client-layer');
  assert.equal(TRUST.proofKind, 'scaffold-sha256');
  assert.equal(TRUST.proofNote.includes('Groth16'), true);
  assert.equal(isMasterWalletMaterial('abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'), true);
  assert.equal(isMasterWalletMaterial('https://api.ks.local/vproxy/openrouter/'), false);
  assert.equal(isMasterWalletMaterial('[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32]'), true);

  console.log('errors + trust boundaries ok');
}

main();
