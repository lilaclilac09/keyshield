import assert from 'node:assert/strict';
import { IX_INIT_ZK_VAULT, IX_REGISTER_ROOT, IX_REVOKE_ZK_GRANT, IX_VERIFY_AND_EXECUTE, planVerifyExecute } from './onchain';
import type { AuthorizationProof } from './zk';

function main() {
  const proof = {
    kind: 'scaffold-sha256',
    publicInputs: {
      agentId: 'demo-agent',
      actionHash: 'aa'.repeat(32),
      spendCap: '5000',
      validUntilSlot: '99',
      merkleRoot: 'bb'.repeat(32),
      nullifier: 'cc'.repeat(32),
      credentialCommitment: 'dd'.repeat(32),
    },
    merkle: { leafIndex: 0, leaf: 'ee'.repeat(32), siblings: [], dirs: [] },
    constraints: { merkleMember: true, withinCap: true, withinWindow: true, nullifierBound: true },
    proofHex: 'ff'.repeat(32),
  } as AuthorizationProof;

  const planned = planVerifyExecute(proof, '5000');
  assert.deepEqual(
    planned.ixs.map((i) => i.name),
    ['init_vault', 'update_policy', 'execute_action', 'revoke_grant'],
  );
  assert.equal(planned.ixs[0].args.disc, String(IX_INIT_ZK_VAULT));
  assert.equal(planned.ixs[1].args.disc, String(IX_REGISTER_ROOT));
  assert.equal(planned.ixs[2].args.disc, String(IX_VERIFY_AND_EXECUTE));
  assert.equal(planned.ixs[3].args.disc, String(IX_REVOKE_ZK_GRANT));
  assert.equal(planned.ixs[0].args.seeds, '[b"keyshield", owner]');
  assert.equal(planned.ixs[2].args.seeds, '[b"nullifier", nullifier_hash]');
  assert.equal(planned.verifier, 'scaffold-sha256');
  console.log('onchain ix plan ok', planned.ixs.map((i) => i.name).join(' → '));
}

main();
