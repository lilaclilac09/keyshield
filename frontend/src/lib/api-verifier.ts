/**
 * API Key Verification Utilities
 * 
 * Provides safe verification endpoints for various API providers.
 * These endpoints are read-only and don't expose sensitive data.
 */

import { APIKeyType } from './api-key-generators';

export type VerificationResult = {
  valid: boolean;
  error?: string;
  message?: string;
};

/**
 * Verify Helius API key using health endpoint
 */
export async function verifyHeliusKey(key: string): Promise<VerificationResult> {
  try {
    const response = await fetch(`https://api.helius.xyz/v1/health?api-key=${encodeURIComponent(key)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      return { valid: true, message: 'Helius API key is valid' };
    } else if (response.status === 401 || response.status === 403) {
      return { valid: false, error: 'Invalid API key' };
    } else {
      return { valid: false, error: `Verification failed: ${response.statusText}` };
    }
  } catch (error: any) {
    return { valid: false, error: `Network error: ${error.message}` };
  }
}

/**
 * Verify GitHub token using user endpoint
 */
export async function verifyGitHubToken(token: string): Promise<VerificationResult> {
  try {
    const response = await fetch('https://api.github.com/user', {
      method: 'GET',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      return { valid: true, message: `Valid token for user: ${data.login || 'unknown'}` };
    } else if (response.status === 401) {
      return { valid: false, error: 'Invalid or expired token' };
    } else {
      return { valid: false, error: `Verification failed: ${response.statusText}` };
    }
  } catch (error: any) {
    return { valid: false, error: `Network error: ${error.message}` };
  }
}

/**
 * Verify OpenAI API key using models endpoint
 */
export async function verifyOpenAIKey(key: string): Promise<VerificationResult> {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      return { valid: true, message: 'OpenAI API key is valid' };
    } else if (response.status === 401) {
      return { valid: false, error: 'Invalid API key' };
    } else {
      return { valid: false, error: `Verification failed: ${response.statusText}` };
    }
  } catch (error: any) {
    return { valid: false, error: `Network error: ${error.message}` };
  }
}

/**
 * Verify API key based on type
 */
export async function verifyApiKey(key: string, keyType: APIKeyType): Promise<VerificationResult> {
  switch (keyType) {
    case APIKeyType.Helius:
      return await verifyHeliusKey(key);
    case APIKeyType.GitHub:
      return await verifyGitHubToken(key);
    case APIKeyType.OpenAI:
      return await verifyOpenAIKey(key);
    default:
      return { valid: false, error: 'Verification not supported for this provider' };
  }
}

/**
 * Check if a provider supports verification
 */
export function supportsVerification(keyType: APIKeyType): boolean {
  return [
    APIKeyType.Helius,
    APIKeyType.GitHub,
    APIKeyType.OpenAI,
  ].includes(keyType);
}
