import assert from 'node:assert/strict';
import { deriveFromPrf, deriveSessionKey, deriveWitness, deriveVaultId, demoSoftPrf } from './prf';
import { CredentialMerkleTree, consumeWitness, generateAuthorizationProof } from './zk';
import { actionHashOf, deriveNullifier } from './zk';
import { toHex } from './bytes';

async function main() {
  const prfA = await demoSoftPrf();
  const prfB = await demoSoftPrf();
  assert.equal(toHex(prfA), toHex(prfB), 'demo-soft PRF is deterministic');

  const w1 = await deriveWitness(prfA);
  const w2 = await deriveWitness(prfB);
  assert.equal(toHex(w1), toHex(w2), 'HKDF witness is deterministic');

  const id1 = await deriveVaultId(prfA);
  const id2 = await deriveVaultId(prfB);
  assert.equal(id1, id2);

  const a = await deriveFromPrf(prfA, 'demo-soft');
  const b = await deriveFromPrf(prfB, 'demo-soft');
  assert.equal(a.view.witnessCommitment, b.view.witnessCommitment);
  assert.equal(a.view.prfCommitment, b.view.prfCommitment);
  assert.equal(a.view.verifyLayer, 'client-layer');
  assert.equal(JSON.stringify(a.view).includes(toHex(a.witness)), false, 'public view must not embed witness');

  const key = await deriveSessionKey(prfA);
  assert.equal(key.type, 'secret');
  assert.equal(key.extractable, false);

  const h1 = await actionHashOf('{"method":"export.session-key"}');
  const h2 = await actionHashOf('{"method":"other"}');
  const n1 = await deriveNullifier(w1, h1, 'demo-agent');
  const n2 = await deriveNullifier(w1, h2, 'demo-agent');
  assert.notEqual(toHex(n1), toHex(n2), 'nullifier binds action');

  const tree = new CredentialMerkleTree();
  await tree.insertHex(a.view.prfCommitment);
  const proof = await generateAuthorizationProof({
    secret: w1,
    prfCommitment: a.view.prfCommitment,
    agentId: 'demo-agent',
    actionPayload: '{"method":"export.session-key"}',
    amount: 5000n,
    spendCap: 5000n,
    nowSlot: 10n,
    validUntilSlot: 99n,
    tree,
  });
  assert.equal(proof.kind, 'scaffold-sha256');
  assert.equal(proof.publicInputs.agentId, 'demo-agent');
  consumeWitness(w1);
  assert.equal(w1.every((x) => x === 0), true, 'witness zeroized');

  const serialized = JSON.stringify(proof);
  assert.equal(serialized.includes('circuit-witness'), false);
  console.log('prf+hkdf+zk ok', {
    vaultId: id1.slice(0, 8),
    proof: proof.kind,
    nullifier: proof.publicInputs.nullifier.slice(0, 12),
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
