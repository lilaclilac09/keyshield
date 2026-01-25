/**
 * Oracle Service
 * 
 * Reads vault from on-chain, decrypts API keys using Lit Protocol,
 * calls external APIs (GitHub/Helius/Google Gemini), and returns results.
 * Results can be posted to on-chain programs via transactions.
 */

import { PublicKey, Connection } from '@solana/web3.js';
import { KeyShieldClient } from './keyshield-client';
import { decryptWithLitFromHash, createWalletAccessConditions } from './lit-protocol';
import { APIKeyType } from './api-key-generators';
import * as LitJsSdk from '@lit-protocol/lit-node-client';

export interface OracleRequest {
  vaultOwner: PublicKey;
  apiEndpoint: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
  sessionSigs?: any; // Lit Protocol session signatures (required for decryption)
}

export interface OracleResponse {
  success: boolean;
  data?: any;
  error?: string;
  statusCode?: number;
}

export interface OracleResult {
  request: OracleRequest;
  response: OracleResponse;
  timestamp: number;
  apiKeyType: APIKeyType;
}

/**
 * Oracle Service Class
 * Handles reading vault, decrypting keys, and calling external APIs
 */
export class OracleService {
  private connection: Connection;
  private client: KeyShieldClient;
  private walletPublicKey: PublicKey | null;

  constructor(connection: Connection, programId: PublicKey, walletPublicKey: PublicKey | null) {
    this.connection = connection;
    this.client = new KeyShieldClient(connection, programId);
    this.walletPublicKey = walletPublicKey;
  }

  /**
   * Get API key from vault and decrypt it
   * @param vaultOwner - Owner of the vault
   * @param sessionSigs - Lit Protocol session signatures (required for decryption)
   */
  async getDecryptedApiKey(
    vaultOwner: PublicKey,
    sessionSigs: any
  ): Promise<{ apiKey: string; keyType: APIKeyType }> {
    // Read vault from on-chain
    const vault = await this.client.getVault(vaultOwner);
    if (!vault) {
      throw new Error('Vault not found');
    }

    // Get key type from access_flags
    const keyTypeValue = (vault.accessFlags >> 1) & 0x07;
    const keyType = keyTypeValue === 1 ? APIKeyType.GitHub
      : keyTypeValue === 2 ? APIKeyType.Helius
      : keyTypeValue === 3 ? APIKeyType.GoogleGemini
      : APIKeyType.Generic;

    // Check if requester is owner
    if (!this.walletPublicKey || !this.walletPublicKey.equals(vault.owner)) {
      throw new Error('Only vault owner can decrypt API keys');
    }

    // Create access conditions for Lit Protocol
    const accessConditions = createWalletAccessConditions(this.walletPublicKey.toString());

    // Decrypt API key using hash from vault
    const apiKey = await decryptWithLitFromHash(
      vault.encryptedKeyHash,
      accessConditions,
      sessionSigs
    );

    return { apiKey, keyType };
  }

  /**
   * Call external API using decrypted API key
   */
  async callExternalAPI(request: OracleRequest): Promise<OracleResponse> {
    try {
      if (!request.sessionSigs) {
        throw new Error('Session signatures required for API key decryption');
      }

      // Get decrypted API key
      const { apiKey, keyType } = await this.getDecryptedApiKey(request.vaultOwner, request.sessionSigs);

      // Build request headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...request.headers,
      };

      // Add API key to headers based on key type
      switch (keyType) {
        case APIKeyType.GitHub:
          headers['Authorization'] = `Bearer ${apiKey}`;
          break;
        case APIKeyType.Helius:
          headers['x-api-key'] = apiKey;
          break;
        case APIKeyType.GoogleGemini:
          // Google Gemini uses query parameter or header
          if (request.apiEndpoint.includes('?')) {
            request.apiEndpoint += `&key=${apiKey}`;
          } else {
            request.apiEndpoint += `?key=${apiKey}`;
          }
          break;
        default:
          headers['Authorization'] = `Bearer ${apiKey}`;
      }

      // Make API call
      const response = await fetch(request.apiEndpoint, {
        method: request.method || 'GET',
        headers,
        body: request.body ? JSON.stringify(request.body) : undefined,
      });

      let data: any;
      try {
        data = await response.json();
      } catch {
        data = { text: await response.text() };
      }

      return {
        success: response.ok,
        data,
        statusCode: response.status,
        error: response.ok ? undefined : `API call failed: ${response.statusText}`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Unknown error',
      };
    }
  }

  /**
   * Call GitHub API
   */
  async callGitHubAPI(
    vaultOwner: PublicKey,
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: any
  ): Promise<OracleResponse> {
    return this.callExternalAPI({
      vaultOwner,
      apiEndpoint: `https://api.github.com${endpoint}`,
      method,
      body,
    });
  }

  /**
   * Call Helius API
   */
  async callHeliusAPI(
    vaultOwner: PublicKey,
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    body?: any
  ): Promise<OracleResponse> {
    return this.callExternalAPI({
      vaultOwner,
      apiEndpoint: `https://api.helius.dev${endpoint}`,
      method,
      body,
    });
  }

  /**
   * Call Google Gemini API
   */
  async callGoogleGeminiAPI(
    vaultOwner: PublicKey,
    endpoint: string,
    method: 'GET' | 'POST' = 'POST',
    body?: any
  ): Promise<OracleResponse> {
    return this.callExternalAPI({
      vaultOwner,
      apiEndpoint: `https://generativelanguage.googleapis.com/v1${endpoint}`,
      method,
      body,
    });
  }

  /**
   * Execute oracle call and return result
   */
  async executeOracleCall(request: OracleRequest): Promise<OracleResult> {
    const response = await this.callExternalAPI(request);
    
    // Get key type for result
    const vault = await this.client.getVault(request.vaultOwner);
    const keyTypeValue = vault ? ((vault.accessFlags >> 1) & 0x07) : 0;
    const apiKeyType = keyTypeValue === 1 ? APIKeyType.GitHub
      : keyTypeValue === 2 ? APIKeyType.Helius
      : keyTypeValue === 3 ? APIKeyType.GoogleGemini
      : APIKeyType.Generic;

    return {
      request,
      response,
      timestamp: Date.now(),
      apiKeyType,
    };
  }
}

/**
 * Create oracle service instance
 */
export function createOracleService(
  connection: Connection,
  programId: PublicKey,
  walletPublicKey: PublicKey | null
): OracleService {
  return new OracleService(connection, programId, walletPublicKey);
}
