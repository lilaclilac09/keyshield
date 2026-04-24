/**
 * Bonsol ZK proof verifier stub.
 *
 * Placeholder until the real Bonsol integration is wired up.
 */

export interface BonsolProof {
  bytes: Uint8Array;
  createdAt: number;
  [key: string]: unknown;
}

export interface BonsolProofParams {
  agentPubkey?: string;
  keyName?: string;
  [key: string]: unknown;
}

export class BonsolVerifier {
  async createProof(_params: BonsolProofParams): Promise<BonsolProof> {
    throw new Error('BonsolVerifier.createProof is a stub.');
  }

  async verifyProof(_proof: BonsolProof): Promise<boolean> {
    throw new Error('BonsolVerifier.verifyProof is a stub.');
  }
}
