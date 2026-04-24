/**
 * Lit Protocol stub.
 *
 * Placeholder so the import graph resolves. The real Lit threshold
 * decryption lives elsewhere (to be wired in V1.1+). Tests mock this.
 */

export interface LitConfig {
  network: 'datil-dev' | 'datil';
  chain: 'solana';
}

export class LitProtocol {
  constructor(private readonly _config: LitConfig) {}
  async init(): Promise<void> {}
  async decrypt(_params: any): Promise<string> {
    throw new Error(
      'LitProtocol.decrypt is a stub. Mock this in tests or wire up the real Lit SDK.',
    );
  }
}
