import { PublicKey } from '@solana/web3.js';

export interface Vault {
  discriminator: Uint8Array;
  owner: PublicKey;
  encryptedKey: Uint8Array;
  zkCommit: Uint8Array;
  mpcHash: Uint8Array;
  createdAt: number;
  accessFlags: number;
}

export interface StoreKeyParams {
  apiKey: string;
  keyName: string;
  timeLocked?: boolean;
  accessConditions?: AccessCondition[];
}

export interface AccessCondition {
  type: 'wallet' | 'time' | 'nft' | 'token';
  value: string | number;
}

export interface ShareKeyParams {
  vaultAddress: PublicKey;
  recipient: PublicKey;
  timeLock?: number;
  mpcEnabled?: boolean;
}

export interface ZKProof {
  proof: Uint8Array;
  publicInputs: Uint8Array;
}
