import * as LitJsSdk from '@lit-protocol/lit-node-client';
import { LIT_NETWORK } from '@lit-protocol/constants';
import { AccessControlConditions } from '@lit-protocol/types';

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
    client
  );

  return { ciphertext, dataToEncryptHash };
}

/**
 * Decrypt API key with Lit Protocol
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
    client
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
