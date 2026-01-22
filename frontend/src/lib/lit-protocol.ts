import * as LitJsSdk from '@lit-protocol/lit-node-client';
import { AccessControlConditions } from '@lit-protocol/types';
import { getCiphertext, keyToHash } from './ciphertext-storage';

let litClient: LitJsSdk.LitNodeClient | null = null;

/**
 * Initialize Lit Protocol client
 */
export async function initLitClient(): Promise<LitJsSdk.LitNodeClient> {
  if (litClient) {
    return litClient;
  }

  const network = (process.env.NEXT_PUBLIC_LIT_NETWORK || 'datil') as any;
  litClient = new LitJsSdk.LitNodeClient({
    litNetwork: network,
  });

  await litClient.connect();
  return litClient;
}

/**
 * Encrypt API key with Lit Protocol
 */
export async function encryptWithLit(
  dataToEncrypt: string,
  accessControlConditions: AccessControlConditions
): Promise<{ ciphertext: string; dataToEncryptHash: string }> {
  const client = await initLitClient();

  const { ciphertext, dataToEncryptHash } = await LitJsSdk.encryptString(
    {
      accessControlConditions,
      dataToEncrypt,
      chain: 'solana',
    },
    client as any
  );

  return { ciphertext, dataToEncryptHash };
}

/**
 * Get ciphertext from off-chain storage using hash
 * @param hashBytes - dataToEncryptHash as Uint8Array (from on-chain vault)
 * @returns Full ciphertext string or null if not found
 */
export async function getCiphertextFromStorage(hashBytes: Uint8Array): Promise<string | null> {
  // Convert hash bytes to base64 string for storage key
  const hashBase64 = btoa(String.fromCharCode(...hashBytes));
  return await getCiphertext(hashBase64);
}

/**
 * Decrypt API key with Lit Protocol
 * @param hashBytes - dataToEncryptHash as Uint8Array (from on-chain vault)
 * @param accessControlConditions - Access control conditions
 * @param sessionSigs - Session signatures for authentication
 * @returns Decrypted API key string
 */
export async function decryptWithLitFromHash(
  hashBytes: Uint8Array,
  accessControlConditions: AccessControlConditions,
  sessionSigs: any
): Promise<string> {
  // Retrieve full ciphertext from off-chain storage
  const ciphertext = await getCiphertextFromStorage(hashBytes);
  if (!ciphertext) {
    throw new Error('Ciphertext not found in storage. It may have been deleted or never stored.');
  }

  // Convert hash bytes back to base64 string for Lit Protocol
  const dataToEncryptHash = btoa(String.fromCharCode(...hashBytes));

  return await decryptWithLit(ciphertext, dataToEncryptHash, accessControlConditions, sessionSigs);
}

/**
 * Decrypt API key with Lit Protocol (direct ciphertext version)
 * Use this if you already have the ciphertext string
 */
export async function decryptWithLit(
  ciphertext: string,
  dataToEncryptHash: string,
  accessControlConditions: AccessControlConditions,
  sessionSigs: any
): Promise<string> {
  const client = await initLitClient();

  const decryptedString = await LitJsSdk.decryptToString(
    {
      accessControlConditions,
      ciphertext,
      dataToEncryptHash,
      chain: 'solana',
      sessionSigs,
    },
    client as any
  );

  return decryptedString;
}

/**
 * Create access control conditions for wallet-based access
 */
export function createWalletAccessConditions(walletAddress: string): AccessControlConditions {
  return [
    {
      conditionType: 'solana',
      method: '',
      params: [':userAddress'],
      chain: 'solana',
      returnValueTest: {
        comparator: '=',
        value: walletAddress,
      },
    },
  ];
}

/**
 * Create access control conditions for time-locked access
 */
export function createTimeLockConditions(unlockTimestamp: number): AccessControlConditions {
  return [
    {
      conditionType: 'evmBasic',
      contractAddress: '',
      standardContractType: '',
      chain: 'ethereum',
      method: 'eth_getBlockByNumber',
      parameters: ['latest', 'false'],
      returnValueTest: {
        comparator: '>=',
        value: unlockTimestamp.toString(),
      },
    },
  ];
}
