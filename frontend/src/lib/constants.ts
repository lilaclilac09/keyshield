import { PublicKey } from '@solana/web3.js';

// Program ID - replace with your deployed program ID
export const PROGRAM_ID = new PublicKey('11111111111111111111111111111111'); // Placeholder

// Instruction discriminators
export const INSTRUCTION = {
  STORE_KEY: 0,
  ACCESS_KEY: 1,
  SHARE_KEY: 2,
} as const;

// Vault account size
export const VAULT_SIZE = 288;

// PDA seeds
export const VAULT_SEED = 'vault';
export const SHARE_SEED = 'share';
