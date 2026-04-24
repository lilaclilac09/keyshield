/**
 * KeyShield on-chain client stub.
 *
 * Wraps calls to the KeyShield Solana program. The real implementation
 * will build + send transactions; this stub satisfies the import graph
 * so the rest of the SDK can be type-checked and unit-tested.
 *
 * Real tests should mock this class — see packages/goat-wallet/src/priority-fee.test.ts
 * for the pattern.
 */

import { Connection } from '@solana/web3.js';

export interface KeyShieldClientConfig {
  rpcUrl: string;
  programId: string;
  connection?: Connection;
}

type AnyParams = Record<string, unknown>;

export class KeyShieldClient {
  readonly connection: Connection;
  readonly programId: string;

  constructor(config: KeyShieldClientConfig) {
    this.connection = config.connection ?? new Connection(config.rpcUrl);
    this.programId = config.programId;
  }

  async getKey(_params: AnyParams): Promise<any> {
    throw new Error('KeyShieldClient.getKey is a stub.');
  }

  async getKeysInGroup(_params: AnyParams): Promise<Record<string, any>> {
    throw new Error('KeyShieldClient.getKeysInGroup is a stub.');
  }

  async startStreamingPayment(_params: AnyParams): Promise<any> {
    throw new Error('KeyShieldClient.startStreamingPayment is a stub.');
  }

  async payForService(_params: AnyParams): Promise<string> {
    throw new Error('KeyShieldClient.payForService is a stub.');
  }

  async getAgentStatus(_params: AnyParams): Promise<any> {
    throw new Error('KeyShieldClient.getAgentStatus is a stub.');
  }

  async revokeAgentAccess(_params: AnyParams): Promise<string> {
    throw new Error('KeyShieldClient.revokeAgentAccess is a stub.');
  }

  async settlePayment(_params: AnyParams): Promise<string> {
    throw new Error('KeyShieldClient.settlePayment is a stub.');
  }

  async closePaymentStream(_params: AnyParams): Promise<string> {
    throw new Error('KeyShieldClient.closePaymentStream is a stub.');
  }
}
