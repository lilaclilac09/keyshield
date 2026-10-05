import assert from 'node:assert/strict';
import {
  GRANT_TTL_MS,
  attachGrantHeader,
  peekGrant,
  peekGrantByUpstream,
  putGrant,
  revokeAllGrants,
  revokeGrant,
  takeGrant,
  grantMeta,
} from './grant';

function main() {
  revokeAllGrants();
  putGrant('cred-1', 'sk-or-test-key', { ttlMs: GRANT_TTL_MS, upstream: 'openrouter' });
  assert.equal(peekGrant('cred-1'), 'sk-or-test-key');
  assert.equal(peekGrantByUpstream('openrouter'), 'sk-or-test-key');
  assert.equal(grantMeta('cred-1').active, true);
  assert.ok(grantMeta('cred-1').ttlMs > 0);
  assert.ok(grantMeta('cred-1').ttlMs <= GRANT_TTL_MS);

  const headers = new Headers();
  assert.equal(attachGrantHeader('/billing/topup', headers), false);
  assert.equal(headers.has('X-Upstream-API-Key'), false);
  assert.equal(attachGrantHeader('/proxy/openrouter/api/v1/chat/completions', headers), true);
  assert.equal(headers.get('X-Upstream-API-Key'), 'sk-or-test-key');

  const already = new Headers({ 'X-Upstream-API-Key': 'keep' });
  assert.equal(attachGrantHeader('/proxy/openrouter/x', already), false);
  assert.equal(already.get('X-Upstream-API-Key'), 'keep');

  const manage = new Headers();
  assert.equal(attachGrantHeader('/manage/decrypt/openrouter', manage), false);
  assert.equal(manage.has('X-Upstream-API-Key'), false);

  takeGrant('cred-1');
  assert.equal(peekGrant('cred-1'), null);

  putGrant('cred-2', 'gsk_tmp', { ttlMs: 1, upstream: 'groq' });
  const expired = Date.now();
  while (Date.now() - expired < 3) {
    /* spin 1ms TTL */
  }
  assert.equal(peekGrant('cred-2'), null);
  assert.equal(grantMeta('cred-2').active, false);

  putGrant('cred-3', 'wipe-me', { upstream: 'openai' });
  revokeGrant('cred-3');
  assert.equal(peekGrant('cred-3'), null);
  assert.equal(peekGrantByUpstream('openai'), null);

  console.log('grant ttl/revoke/proxy-header ok');
}

main();
