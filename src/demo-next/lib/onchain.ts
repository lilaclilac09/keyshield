/**
 * Intended 3-ix Devnet surface (not shipped on 41P2wHK… yet):
 *   initialize_vault / register_root / verify_and_execute
 *
 * Existing pinocchio program has UniversalVault + MPP settle, not Groth16.
 * This module only builds the *public* payload. Proof verification on-chain
 * is labeled `not-shipped` — do not treat as alt_bn128 pairing.
 */

import type { AuthorizationProof } from './zk';

export const ONCHAIN_VERIFIER = 'not-shipped' as const;

export interface PlannedIxs {
  verifier: typeof ONCHAIN_VERIFIER;
  programNote: string;
  ixs: {
    name: string;
    args: Record<string, string>;
  }[];
}

export function planVerifyExecute(proof: AuthorizationProof, amount: string): PlannedIxs {
  return {
    verifier: ONCHAIN_VERIFIER,
    programNote:
      'Pinocchio ixs 40–43 exist (init/update/execute/revoke). Proof check is scaffold (non-empty bytes), not Groth16 pairing. Passkey verify stays client-layer.',
    ixs: [
      {
        name: 'initialize_vault',
        args: { spend_cap: proof.publicInputs.spendCap, merkle_root: proof.publicInputs.merkleRoot },
      },
      {
        name: 'register_root',
        args: { merkle_root: proof.publicInputs.merkleRoot },
      },
      {
        name: 'verify_and_execute',
        args: {
          nullifier: proof.publicInputs.nullifier,
          action_hash: proof.publicInputs.actionHash,
          amount,
          proof_kind: proof.kind,
          proof: proof.proofHex,
        },
      },
    ],
  };
}
