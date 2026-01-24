import { LitNodeClient } from '@lit-protocol/lit-node-client';
import { AccessControlConditions } from '@lit-protocol/types';
import { LitAccessControlConditionResource } from '@lit-protocol/auth-helpers';
import { getCiphertext, keyToHash } from './ciphertext-storage';
import * as LitJsSdk from '@lit-protocol/lit-node-client';

// Lit Ability constant - using the string value from constants
// The ability value is "access-control-condition-decryption" (lowercase with hyphens)
const LIT_ABILITY_ACCESS_CONTROL_CONDITION_DECRYPTION = 'access-control-condition-decryption' as const;

let litClient: LitNodeClient | null = null;

/**
 * Initialize Lit Protocol client
 */
export async function initLitClient(): Promise<LitNodeClient> {
  if (litClient) {
    return litClient;
  }

  const network = (process.env.NEXT_PUBLIC_LIT_NETWORK || 'datil') as any;
  litClient = new LitNodeClient({
    litNetwork: network,
    debug: false,
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

  // Use the unified encryptString method
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
 * Generate session signatures for Lit Protocol using Solana wallet
 * This is the new v4 API method that replaces checkAndSignAuthMessage
 */
export async function generateSessionSigs(
  walletPublicKey: string,
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>
): Promise<any> {
  const client = await initLitClient();
  const accessConditions = createWalletAccessConditions(walletPublicKey);

  // Use getSessionSigs from lit-node-client (v4 API)
  const sessionSigs = await client.getSessionSigs({
    chain: 'solana',
    expiration: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(), // 24 hours
    resourceAbilityRequests: [
      {
        resource: new LitAccessControlConditionResource(
          JSON.stringify(accessConditions)
        ),
        ability: LIT_ABILITY_ACCESS_CONTROL_CONDITION_DECRYPTION as any,
      } as any,
    ] as any,
    authNeededCallback: async (params: any) => {
      // For Solana, we need to sign a message with the wallet
      if (!signMessage) {
        // Fallback: try to use window.solana directly
        const provider = (window as any).solana || (window as any).phantom?.solana;
        if (!provider || !provider.isConnected) {
          throw new Error('Wallet not connected. Please connect your Solana wallet.');
        }

        const message = new TextEncoder().encode(params.statement || 'Lit Protocol Authentication');
        const response = await provider.signMessage(message, 'utf8');
        
        return {
          sig: Array.from(response.signature),
          derivedVia: 'solana.signMessage',
          signedMessage: params.statement || message.toString(),
          address: provider.publicKey.toString(),
        };
      }

      // Use provided signMessage function (wallet adapter returns Uint8Array directly)
      const message = new TextEncoder().encode(params.statement || 'Lit Protocol Authentication');
      const signature = await signMessage(message);
      
      return {
        sig: Array.from(signature),
        derivedVia: 'solana.signMessage',
        signedMessage: params.statement || message.toString(),
        address: walletPublicKey,
      };
    },
  });

  return sessionSigs;
}

/**
 * Create access control conditions for wallet-based access
 * Updated for Lit Protocol v4 unified conditions format
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
  ] as AccessControlConditions;
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
