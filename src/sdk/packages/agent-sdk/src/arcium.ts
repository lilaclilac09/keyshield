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

export class ArciumMPC {
  async createEphemeralSigner(params: any): Promise<EphemeralSignerResult> {
    const kp = Keypair.generate();
    const expirySecs = params?.expirySeconds ?? 7200;
    return {
      publicKey: kp.publicKey,
      privateKey: kp.secretKey,
      expiry: Date.now() + expirySecs * 1000,
      allowedActions: params?.allowedActions ?? [],
    };
  }

  async shareKey(_params: any): Promise<void> {
    throw new Error('ArciumMPC.shareKey is a stub.');
  }
}
