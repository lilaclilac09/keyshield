import assert from 'node:assert/strict';
import { normalizeStats, usageTotals } from './usage-stats.ts';

const sample = {
  upstream: 'openai',
  key_type: 'self_custodian',
  calls: 2,
  tokens_in: 120,
  tokens_out: 80,
  cost_usd: 0.0012,
  avg_latency: 42,
  last_used: 1,
};

assert.deepEqual(normalizeStats([sample]).map(r => r.upstream), ['openai']);
assert.deepEqual(normalizeStats({ stats: [sample] }).map(r => r.tokens_in), [120]);
assert.deepEqual(
  normalizeStats({ stats: { stats: [sample] } }).map(r => r.tokens_out),
  [80],
);
assert.deepEqual(normalizeStats(null), []);
assert.deepEqual(normalizeStats({ stats: 'nope' }), []);

const totals = usageTotals(normalizeStats({ stats: [sample, { ...sample, upstream: 'groq', tokens_in: 40, tokens_out: 10, cost_usd: 0.0001, calls: 1 }] }));
assert.equal(totals.tokens_in, 160);
assert.equal(totals.tokens_out, 90);
assert.equal(totals.calls, 3);

console.log('usage-stats unwrap ok');
