import { test } from 'node:test';
import assert from 'node:assert/strict';
import { networkSummary, stats } from './dashboard-journey.mjs';

test('numeric network accounting clips overlap and attributes bytes by start', () => {
  const records=[{start:0,end:15,bytes:10},{start:12,end:25,bytes:20},{start:16,end:18,bytes:30}];
  assert.deepEqual(networkSummary(records,10,20), {
    requests:2, bytes:50, summedMs:15, busyMs:10, criticalPathMs:10,
  });
});
test('empty network step is all zeros', () => {
  assert.deepEqual(networkSummary([],0,10), {
    requests:0,bytes:0,summedMs:0,busyMs:0,criticalPathMs:0,
  });
});
test('failed request with zero bytes still counts', () => {
  assert.equal(networkSummary([{start:1,end:2,bytes:0}],0,3).requests,1);
});
test('median, range, even samples and missing samples', () => {
  assert.deepEqual(stats([9,1,3]),{median:3,min:1,max:9});
  assert.equal(stats([4,2]).median,3);
  assert.throws(()=>stats([]),/No measurements/);
});
