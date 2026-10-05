import assert from 'node:assert/strict';
import { deriveFromPrf, demoSoftPrf } from './prf';
import {
  CircuitError,
  CredentialMerkleTree,
  consumeWitness,
  deriveNullifier,
  generateAuthorizationProof,
  verifyPublicProof,
} from './zk';
import { actionHashOf } from './zk';
import { te, toHex } from './bytes';

async function treeWith(hex: string, extras = 2): Promise<CredentialMerkleTree> {
  const tree = new CredentialMerkleTree();
  await tree.insertHex(hex);
  for (let i = 0; i < extras; i++) {
    const pad = await crypto.subtle.digest('SHA-256', te(`pad-${i}`));
    tree.insert(new Uint8Array(pad));
  }
  return tree;
}

async function main() {
  const prf = await demoSoftPrf();
  const derived = await deriveFromPrf(prf, 'demo-soft');
  const secret = derived.witness;
  const tree = await treeWith(derived.view.prfCommitment);

  const cred = te('session-credential-not-an-api-key');
  const proof = await generateAuthorizationProof({
    secret,
    prfCommitment: derived.view.prfCommitment,
    credentialPlain: cred,
    agentId: 'demo-agent',
    actionPayload: '{"method":"export.session-key"}',
    amount: 5000n,
    spendCap: 10_000n,
    nowSlot: 80n,
    validUntilSlot: 99n,
    tree,
  });

  assert.equal(proof.kind, 'scaffold-sha256');
  assert.equal(proof.publicInputs.agentId, 'demo-agent');
  assert.equal(proof.constraints.merkleMember, true);
  assert.equal(proof.constraints.withinCap, true);
  assert.equal(proof.constraints.withinWindow, true);
  assert.equal(proof.constraints.nullifierBound, true);
  assert.equal(await verifyPublicProof(proof, { amount: 5000n, nowSlot: 80n }), true);
  assert.equal(await verifyPublicProof(proof, { amount: 11_000n, nowSlot: 80n }), false);
  assert.equal(await verifyPublicProof(proof, { amount: 5000n, nowSlot: 100n }), false);

  const dumped = JSON.stringify(proof);
  assert.equal(dumped.includes(toHex(secret)), false, 'secret must not appear in proof JSON');
  assert.equal(dumped.includes('session-credential-not-an-api-key'), false, 'credential plaintext must not leak');

  const action = await actionHashOf('{"method":"export.session-key"}');
  const n1 = await deriveNullifier(secret, action, 'demo-agent');
  const n2 = await deriveNullifier(secret, action, 'demo-agent');
  const n3 = await deriveNullifier(secret, await actionHashOf('{"method":"other"}'), 'demo-agent');
  const n4 = await deriveNullifier(secret, action, 'other-agent');
  assert.equal(toHex(n1), toHex(n2));
  assert.equal(toHex(n1), proof.publicInputs.nullifier);
  assert.notEqual(toHex(n1), toHex(n3), 'nullifier binds action');
  assert.notEqual(toHex(n1), toHex(n4), 'nullifier binds agent');

  const empty = new CredentialMerkleTree();
  await assert.rejects(
    () => empty.proveHex(derived.view.prfCommitment),
    (e: unknown) => e instanceof CircuitError && e.code === 'NOT_IN_TREE',
  );

  await assert.rejects(
    () =>
      generateAuthorizationProof({
        secret,
        prfCommitment: derived.view.prfCommitment,
        agentId: 'demo-agent',
        actionPayload: '{}',
        amount: 20_000n,
        spendCap: 10_000n,
        nowSlot: 1n,
        validUntilSlot: 99n,
        tree,
      }),
    (e: unknown) => e instanceof CircuitError && e.code === 'CAP_EXCEEDED',
  );

  await assert.rejects(
    () =>
      generateAuthorizationProof({
        secret,
        prfCommitment: derived.view.prfCommitment,
        agentId: 'demo-agent',
        actionPayload: '{}',
        amount: 1n,
        spendCap: 10_000n,
        nowSlot: 100n,
        validUntilSlot: 99n,
        tree,
      }),
    (e: unknown) => e instanceof CircuitError && e.code === 'PROOF_EXPIRED',
  );

  consumeWitness(secret);
  cred.fill(0);
  assert.equal(secret.every((x) => x === 0), true);
  console.log('zk circuit ok', {
    kind: proof.kind,
    root: proof.publicInputs.merkleRoot.slice(0, 12),
    nullifier: proof.publicInputs.nullifier.slice(0, 12),
    leaves: tree.size,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
