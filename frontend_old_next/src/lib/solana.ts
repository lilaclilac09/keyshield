import { Connection, PublicKey, Transaction, SystemProgram, Keypair } from '@solana/web3.js';
import { PROGRAM_ID } from './constants';

export const getConnection = (): Connection => {
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'https://api.devnet.solana.com';
  return new Connection(rpcUrl, 'confirmed');
};

export const getProgramId = (): PublicKey => {
  const programId = process.env.NEXT_PUBLIC_PROGRAM_ID;
  if (!programId) {
    console.warn('NEXT_PUBLIC_PROGRAM_ID not set, using placeholder');
    // Return a placeholder PublicKey instead of throwing
    // This allows the app to load even without a deployed program
    return new PublicKey('11111111111111111111111111111111');
  }
  
  try {
    return new PublicKey(programId);
  } catch (error: any) {
    console.error('Invalid NEXT_PUBLIC_PROGRAM_ID:', error);
    // Return placeholder on invalid key instead of throwing
    return new PublicKey('11111111111111111111111111111111');
  }
};
