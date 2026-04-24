/**
 * Arcium MPC stub.
 *
 * Placeholder for the Arcium multi-party computation layer. The real
 * implementation generates ephemeral signers via MPC; this stub just
 * returns a locally-generated keypair so the SDK can be exercised in
 * tests without network calls.
 */

import { Keypair, PublicKey } from '@solana/web3.js';

export interface EphemeralSignerResult {
  publicKey: PublicKey;
  privateKey: Uint8Array;
  expiry: number;
  allowedActions: string[];
}

export interface CreateEphemeralSignerParams {
  allowedActions: string[];
  expirySeconds: number;
  proof?: Uint8Array;
}

export interface ShareKeyParams {
  fromAgent: string;
  toAgent: string;
  keyName?: string;
  [key: string]: unknown;
}

export class ArciumMPC {
  async createEphemeralSigner(
    params: CreateEphemeralSignerParams,
  ): Promise<EphemeralSignerResult> {
    const kp = Keypair.generate();
    return {
      publicKey: kp.publicKey,
      privateKey: kp.secretKey,
      expiry: Date.now() + params.expirySeconds * 1000,
      allowedActions: params.allowedActions,
    };
  }

  async shareKey(_params: ShareKeyParams): Promise<void> {
    throw new Error('ArciumMPC.shareKey is a stub.');
  }
}
