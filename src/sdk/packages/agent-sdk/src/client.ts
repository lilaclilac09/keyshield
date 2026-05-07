/**
 * KeyShield on-chain client stub.
 *
 * Wraps calls to the KeyShield Solana program. The real implementation
 * will build + send transactions; this stub satisfies the import graph
 * so the rest of the SDK can be type-checked and unit-tested.
 *
 * Real tests should mock this class — see
 * packages/goat-wallet/src/priority-fee.test.ts for the pattern.
 */

import { Connection, PublicKey } from '@solana/web3.js';

export interface KeyShieldClientConfig {
  /** Either supply a URL to have a new Connection created, or ... */
  rpcUrl?: string;
  /** ... supply an existing Connection to reuse (preferred). */
  connection?: Connection;
  programId: PublicKey | string;
}

export class KeyShieldClient {
  readonly connection: Connection;
  readonly programId: PublicKey;

  constructor(config: KeyShieldClientConfig) {
    if (config.connection) {
      this.connection = config.connection;
    } else if (config.rpcUrl) {
      this.connection = new Connection(config.rpcUrl);
    } else {
      throw new Error(
        'KeyShieldClient requires either `connection` or `rpcUrl`',
      );
    }
    this.programId =
      typeof config.programId === 'string'
        ? new PublicKey(config.programId)
        : config.programId;
  }

  // Stub methods — real implementations will build transactions. The
  // `any` return types are intentional: callers in index.ts use loose
  // shapes and this is a placeholder until the real on-chain client
  // is wired up. Tests should mock this whole class.
  async getKey(_params: any): Promise<any> {
    throw new Error('KeyShieldClient.getKey is a stub.');
  }
  async getKeysInGroup(_params: any): Promise<any> {
    throw new Error('KeyShieldClient.getKeysInGroup is a stub.');
  }
  async startStreamingPayment(_params: any): Promise<any> {
    throw new Error('KeyShieldClient.startStreamingPayment is a stub.');
  }
  async payForService(_params: any): Promise<string> {
    throw new Error('KeyShieldClient.payForService is a stub.');
  }
  async getAgentStatus(_params: any): Promise<any> {
    throw new Error('KeyShieldClient.getAgentStatus is a stub.');
  }
  async revokeAgentAccess(_params: any): Promise<string> {
    throw new Error('KeyShieldClient.revokeAgentAccess is a stub.');
  }
  async settlePayment(_params: any): Promise<string> {
    throw new Error('KeyShieldClient.settlePayment is a stub.');
  }
  async closePaymentStream(_params: any): Promise<string> {
    throw new Error('KeyShieldClient.closePaymentStream is a stub.');
  }
}
