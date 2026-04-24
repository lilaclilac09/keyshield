/**
 * Bonsol ZK-proof verifier stub.
 *
 * The surrounding code treats proofs as plain `Uint8Array` in most paths
 * and as an object in others, so the stub returns `Uint8Array` (the more
 * permissive ambient type) and accepts loosely-typed input.
 */

export class BonsolVerifier {
  async createProof(_params: any): Promise<Uint8Array> {
    throw new Error('BonsolVerifier.createProof is a stub.');
  }
  async verifyProof(_proof: Uint8Array): Promise<boolean> {
    throw new Error('BonsolVerifier.verifyProof is a stub.');
  }
}
