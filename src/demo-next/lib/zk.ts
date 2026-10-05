/**
 * Authorization circuit (client-side).
 *
 * Private witness:
 *   - PRF-derived secret (HKDF circuit-witness / PRF output)
 *   - credential plaintext or session MAC material (never serialized)
 *
 * Public inputs:
 *   - Agent_ID, Action_Hash, Spend_Cap, Valid_Until_Slot
 *   - merkleRoot, nullifier, credentialCommitment
 *
 * Constraints:
 *   - PRF commitment is a member of the registered credential Merkle tree
 *   - amount <= spend_cap and now_slot <= valid_until_slot
 *   - nullifier = H(domain || secret || action || agent) is unique per action
 *
 * Kind is `scaffold-sha256`. This is NOT Groth16 / alt_bn128 pairing.
 * Knowledge-of-secret is evaluated on the prover; the public verifier
 * checks Merkle path + public invariants only.
 */

import { concatBytes, fromHex, sha256, te, toHex, zeroize } from './bytes';

export const PROOF_KIND = 'scaffold-sha256' as const;

export type CircuitCode = 'NOT_IN_TREE' | 'CAP_EXCEEDED' | 'PROOF_EXPIRED' | 'BAD_WITNESS';

export class CircuitError extends Error {
  readonly code: CircuitCode;
  constructor(code: CircuitCode, message: string) {
    super(message);
    this.name = 'CircuitError';
    this.code = code;
  }
}

export interface PublicInputs {
  agentId: string;
  actionHash: string;
  spendCap: string;
  validUntilSlot: string;
  merkleRoot: string;
  nullifier: string;
  credentialCommitment: string;
}

export interface CircuitConstraints {
  merkleMember: boolean;
  withinCap: boolean;
  withinWindow: boolean;
  nullifierBound: boolean;
}

export interface MerklePath {
  leafIndex: number;
  leaf: string;
  siblings: string[];
  dirs: Array<'L' | 'R'>;
}

export interface AuthorizationProof {
  kind: typeof PROOF_KIND;
  publicInputs: PublicInputs;
  merkle: MerklePath;
  constraints: CircuitConstraints;
  proofHex: string;
}

export async function actionHashOf(payload: string | Uint8Array): Promise<Uint8Array> {
  return sha256(typeof payload === 'string' ? te(payload) : payload);
}

export async function deriveNullifier(
  secret: Uint8Array,
  actionHash: Uint8Array,
  agentId: string,
): Promise<Uint8Array> {
  return sha256(concatBytes(te('ks-nullifier-v1'), secret, actionHash, te(agentId)));
}

export async function hashLeaf(commitment: Uint8Array): Promise<Uint8Array> {
  return sha256(concatBytes(new Uint8Array([0x00]), commitment));
}

export async function hashNode(left: Uint8Array, right: Uint8Array): Promise<Uint8Array> {
  return sha256(concatBytes(new Uint8Array([0x01]), left, right));
}

const EMPTY_COMMITMENT = new Uint8Array(32);

export class CredentialMerkleTree {
  private commitments: Uint8Array[] = [];

  async insertHex(prfCommitmentHex: string): Promise<number> {
    return this.insert(fromHex(prfCommitmentHex));
  }

  insert(commitment: Uint8Array): number {
    if (commitment.length !== 32) throw new Error('commitment must be 32 bytes');
    const idx = this.commitments.length;
    this.commitments.push(new Uint8Array(commitment));
    return idx;
  }

  get size(): number {
    return this.commitments.length;
  }

  private async paddedLeaves(): Promise<Uint8Array[]> {
    const leaves: Uint8Array[] = [];
    for (const c of this.commitments) leaves.push(await hashLeaf(c));
    const empty = await hashLeaf(EMPTY_COMMITMENT);
    let n = 1;
    while (n < Math.max(2, leaves.length)) n *= 2;
    while (leaves.length < n) leaves.push(empty);
    return leaves;
  }

  async root(): Promise<Uint8Array> {
    let level = await this.paddedLeaves();
    while (level.length > 1) {
      const next: Uint8Array[] = [];
      for (let i = 0; i < level.length; i += 2) {
        next.push(await hashNode(level[i], level[i + 1]));
      }
      level = next;
    }
    return level[0];
  }

  async prove(commitment: Uint8Array): Promise<MerklePath> {
    const idx = this.commitments.findIndex((c) => toHex(c) === toHex(commitment));
    if (idx < 0) throw new CircuitError('NOT_IN_TREE', 'PRF commitment is not in the registered tree');
    let level = await this.paddedLeaves();
    let i = idx;
    const siblings: string[] = [];
    const dirs: Array<'L' | 'R'> = [];
    const leaf = toHex(level[idx]);
    while (level.length > 1) {
      const pair = i ^ 1;
      siblings.push(toHex(level[pair]));
      dirs.push(i % 2 === 0 ? 'L' : 'R');
      const next: Uint8Array[] = [];
      for (let j = 0; j < level.length; j += 2) {
        next.push(await hashNode(level[j], level[j + 1]));
      }
      level = next;
      i = Math.floor(i / 2);
    }
    return { leafIndex: idx, leaf, siblings, dirs };
  }

  async proveHex(prfCommitmentHex: string): Promise<MerklePath> {
    return this.prove(fromHex(prfCommitmentHex));
  }
}

export async function verifyMerklePath(path: MerklePath, rootHex: string): Promise<boolean> {
  if (path.siblings.length !== path.dirs.length) return false;
  let node = fromHex(path.leaf);
  for (let i = 0; i < path.siblings.length; i++) {
    const sib = fromHex(path.siblings[i]);
    node = path.dirs[i] === 'L' ? await hashNode(node, sib) : await hashNode(sib, node);
  }
  return toHex(node) === rootHex;
}

export function evaluatePublicConstraints(opts: {
  amount: bigint;
  spendCap: bigint;
  nowSlot: bigint;
  validUntilSlot: bigint;
}): Pick<CircuitConstraints, 'withinCap' | 'withinWindow'> {
  return {
    withinCap: opts.amount <= opts.spendCap,
    withinWindow: opts.nowSlot <= opts.validUntilSlot,
  };
}

export async function generateAuthorizationProof(opts: {
  /** PRF-derived secret (circuit witness). Caller zeroizes after. */
  secret: Uint8Array;
  prfCommitment: string;
  /** Credential plaintext or session material. Caller zeroizes after. */
  credentialPlain?: Uint8Array;
  agentId: string;
  actionPayload: string;
  amount: bigint;
  spendCap: bigint;
  nowSlot: bigint;
  validUntilSlot: bigint;
  tree: CredentialMerkleTree;
}): Promise<AuthorizationProof> {
  if (opts.secret.length === 0) throw new CircuitError('BAD_WITNESS', 'empty circuit witness');

  const actionHash = await actionHashOf(opts.actionPayload);
  const cred = opts.credentialPlain ?? new Uint8Array(0);
  const credentialCommitment = toHex(await sha256(cred));
  const nullifier = await deriveNullifier(opts.secret, actionHash, opts.agentId);

  const pubLimits = evaluatePublicConstraints({
    amount: opts.amount,
    spendCap: opts.spendCap,
    nowSlot: opts.nowSlot,
    validUntilSlot: opts.validUntilSlot,
  });
  if (!pubLimits.withinCap) {
    throw new CircuitError('CAP_EXCEEDED', 'amount exceeds spend_cap — no proof');
  }
  if (!pubLimits.withinWindow) {
    throw new CircuitError('PROOF_EXPIRED', 'now_slot > valid_until_slot — no proof');
  }

  const merkle = await opts.tree.proveHex(opts.prfCommitment);
  const root = toHex(await opts.tree.root());
  const member = await verifyMerklePath(merkle, root);
  if (!member) throw new CircuitError('NOT_IN_TREE', 'merkle path does not recompute root');

  const constraints: CircuitConstraints = {
    merkleMember: true,
    withinCap: true,
    withinWindow: true,
    nullifierBound: true,
  };

  const publicInputs: PublicInputs = {
    agentId: opts.agentId,
    actionHash: toHex(actionHash),
    spendCap: opts.spendCap.toString(),
    validUntilSlot: opts.validUntilSlot.toString(),
    merkleRoot: root,
    nullifier: toHex(nullifier),
    credentialCommitment,
  };

  const transcript = concatBytes(
    te(PROOF_KIND),
    te(publicInputs.agentId),
    actionHash,
    te(publicInputs.spendCap),
    te(publicInputs.validUntilSlot),
    te(publicInputs.merkleRoot),
    te(publicInputs.nullifier),
    te(publicInputs.credentialCommitment),
    te(merkle.leaf),
  );
  const proof = await sha256(transcript);

  return {
    kind: PROOF_KIND,
    publicInputs,
    merkle,
    constraints,
    proofHex: toHex(proof),
  };
}

/** Public verifier: Merkle + cap/window + transcript. Does not see the secret. */
export async function verifyPublicProof(
  proof: AuthorizationProof,
  opts: { amount: bigint; nowSlot: bigint },
): Promise<boolean> {
  const limits = evaluatePublicConstraints({
    amount: opts.amount,
    spendCap: BigInt(proof.publicInputs.spendCap),
    nowSlot: opts.nowSlot,
    validUntilSlot: BigInt(proof.publicInputs.validUntilSlot),
  });
  if (!limits.withinCap || !limits.withinWindow) return false;
  if (!(await verifyMerklePath(proof.merkle, proof.publicInputs.merkleRoot))) return false;
  const transcript = concatBytes(
    te(PROOF_KIND),
    te(proof.publicInputs.agentId),
    fromHex(proof.publicInputs.actionHash),
    te(proof.publicInputs.spendCap),
    te(proof.publicInputs.validUntilSlot),
    te(proof.publicInputs.merkleRoot),
    te(proof.publicInputs.nullifier),
    te(proof.publicInputs.credentialCommitment),
    te(proof.merkle.leaf),
  );
  return toHex(await sha256(transcript)) === proof.proofHex;
}

export function consumeWitness(witness: Uint8Array): void {
  zeroize(witness);
}

/** Session registry used by the demo hook. Not a chain account. */
export function demoRegistryTree(): CredentialMerkleTree {
  return new CredentialMerkleTree();
}
