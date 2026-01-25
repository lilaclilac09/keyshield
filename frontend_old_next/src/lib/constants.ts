import { PublicKey } from '@solana/web3.js';

// Program ID - loaded from environment variable
export const PROGRAM_ID = (() => {
  const programId = process.env.NEXT_PUBLIC_PROGRAM_ID;
  if (!programId) {
    console.warn('NEXT_PUBLIC_PROGRAM_ID not set, using placeholder');
    return new PublicKey('11111111111111111111111111111111');
  }
  try {
    return new PublicKey(programId);
  } catch (e) {
    console.error('Invalid NEXT_PUBLIC_PROGRAM_ID:', e);
    return new PublicKey('11111111111111111111111111111111');
  }
})();

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
