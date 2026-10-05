/**
 * Authorization proof inputs.
 *
 * Private witness = HKDF(PRF, info=circuit-witness).
 * Public: agent_id, action_hash, spend_cap, valid_until_slot.
 *
 * This is a SHA-256 transcript (`scaffold-sha256`), NOT Groth16.
 * Do not claim alt_bn128 pairing or on-chain verifier until that ix ships.
 */

import { concatBytes, sha256, te, toHex, zeroize } from './bytes';

export const PROOF_KIND = 'scaffold-sha256' as const;

export interface PublicInputs {
  agentId: string;
  actionHash: string;
  spendCap: string;
  validUntilSlot: string;
  merkleRoot: string;
  nullifier: string;
}

export interface AuthorizationProof {
  kind: typeof PROOF_KIND;
  publicInputs: PublicInputs;
  /** Opaque transcript — not a pairing proof. */
  proofHex: string;
}

export async function actionHashOf(payload: string | Uint8Array): Promise<Uint8Array> {
  const data = typeof payload === 'string' ? te(payload) : payload;
  return sha256(data);
}

export async function deriveNullifier(witness: Uint8Array, actionHash: Uint8Array): Promise<Uint8Array> {
  return sha256(concatBytes(te('ks-nullifier-v1'), witness, actionHash));
}

/** One-leaf membership: root = sha256(0x00 || sha256(prfCommitment)). */
export async function merkleRootFromPrfCommitment(prfCommitmentHex: string): Promise<Uint8Array> {
  const leaf = await sha256(concatBytes(new Uint8Array([0x00]), te(prfCommitmentHex)));
  return leaf;
}

export async function generateAuthorizationProof(opts: {
  witness: Uint8Array;
  prfCommitment: string;
  agentId: string;
  actionPayload: string;
  spendCap: bigint;
  validUntilSlot: bigint;
}): Promise<AuthorizationProof> {
  const actionHash = await actionHashOf(opts.actionPayload);
  const nullifier = await deriveNullifier(opts.witness, actionHash);
  const merkleRoot = await merkleRootFromPrfCommitment(opts.prfCommitment);

  const publicInputs: PublicInputs = {
    agentId: opts.agentId,
    actionHash: toHex(actionHash),
    spendCap: opts.spendCap.toString(),
    validUntilSlot: opts.validUntilSlot.toString(),
    merkleRoot: toHex(merkleRoot),
    nullifier: toHex(nullifier),
  };

  const transcript = concatBytes(
    te(PROOF_KIND),
    te(publicInputs.merkleRoot),
    te(publicInputs.agentId),
    actionHash,
    te(publicInputs.spendCap),
    te(publicInputs.validUntilSlot),
    nullifier,
  );
  const proof = await sha256(transcript);

  return {
    kind: PROOF_KIND,
    publicInputs,
    proofHex: toHex(proof),
  };
}

export function consumeWitness(witness: Uint8Array): void {
  zeroize(witness);
}
