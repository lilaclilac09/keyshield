/**
 * Lit Protocol stub.
 *
 * This is a placeholder so the import graph resolves. The real integration
 * with Lit Protocol's threshold decryption lives elsewhere (to be wired in
 * V1.1+). Tests should mock this class rather than hit a real Lit node.
 */

export interface LitConfig {
  network: 'datil-dev' | 'datil';
  chain: 'solana';
}

export interface LitDecryptParams {
  encryptedData: string;
  encryptedSymmetricKey?: string;
  [key: string]: unknown;
}

export class LitProtocol {
  constructor(private readonly config: LitConfig) {}

  async init(): Promise<void> {
    // no-op stub
  }

  async decrypt(_params: LitDecryptParams): Promise<string> {
    throw new Error(
      'LitProtocol.decrypt is a stub. Wire up the real Lit integration or mock in tests.',
    );
  }
}
