import { Connection, PublicKey, Transaction, SystemProgram, Keypair } from '@solana/web3.js';
import { PROGRAM_ID } from './constants';

export const getConnection = (): Connection => {
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'https://api.devnet.solana.com';
  return new Connection(rpcUrl, 'confirmed');
};

export const getProgramId = (): PublicKey => {
  const programId = process.env.NEXT_PUBLIC_PROGRAM_ID;
  if (!programId) {
    throw new Error('NEXT_PUBLIC_PROGRAM_ID not set');
  }
  
  try {
    return new PublicKey(programId);
  } catch (error: any) {
    throw error;
  }
};
