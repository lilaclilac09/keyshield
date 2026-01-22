/**
 * API Key Generation Helpers
 * 
 * Provides utilities to help users generate API keys from various services.
 * These functions redirect users to the appropriate service pages where they can create new keys.
 */

export enum APIKeyType {
  GitHub = 'github',
  Helius = 'helius',
  GoogleGemini = 'google-gemini',
  Generic = 'generic',
}

export interface APIKeyGenerator {
  name: string;
  type: APIKeyType;
  generateUrl: string;
  instructions: string;
}

/**
 * GitHub Personal Access Token generator
 * Redirects to GitHub settings page for creating new tokens
 */
export function generateGitHubToken(): void {
  const url = 'https://github.com/settings/tokens/new';
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Helius API key generator
 * Redirects to Helius dashboard for creating new API keys
 */
export function generateHeliusKey(): void {
  const url = 'https://dashboard.helius.dev/';
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Google Gemini API key generator
 * Redirects to Google AI Studio for creating new API keys
 */
export function generateGoogleGeminiKey(): void {
  const url = 'https://makersuite.google.com/app/apikey';
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Get generator info for a specific API key type
 */
export function getGeneratorInfo(type: APIKeyType): APIKeyGenerator {
  switch (type) {
    case APIKeyType.GitHub:
      return {
        name: 'GitHub Personal Access Token',
        type: APIKeyType.GitHub,
        generateUrl: 'https://github.com/settings/tokens/new',
        instructions: '1. Click "Generate new token"\n2. Select scopes (repo, workflow, etc.)\n3. Copy the token immediately (it won\'t be shown again)',
      };
    case APIKeyType.Helius:
      return {
        name: 'Helius API Key',
        type: APIKeyType.Helius,
        generateUrl: 'https://dashboard.helius.dev/',
        instructions: '1. Sign in to Helius dashboard\n2. Navigate to API Keys section\n3. Create a new API key\n4. Copy the key',
      };
    case APIKeyType.GoogleGemini:
      return {
        name: 'Google Gemini API Key',
        type: APIKeyType.GoogleGemini,
        generateUrl: 'https://makersuite.google.com/app/apikey',
        instructions: '1. Sign in with your Google account\n2. Click "Create API Key"\n3. Copy the generated key',
      };
    default:
      return {
        name: 'Generic API Key',
        type: APIKeyType.Generic,
        generateUrl: '',
        instructions: 'Please refer to your service\'s documentation for API key generation.',
      };
  }
}

/**
 * Detect API key type from key string
 */
export function detectKeyType(key: string): APIKeyType {
  const trimmed = key.trim();
  
  // GitHub tokens
  if (/^ghp_/.test(trimmed) || /^gho_/.test(trimmed) || /^ghu_/.test(trimmed) || /^ghs_/.test(trimmed) || /^ghr_/.test(trimmed)) {
    return APIKeyType.GitHub;
  }
  
  // Google API keys (includes Gemini)
  if (/^AIza/.test(trimmed)) {
    return APIKeyType.GoogleGemini;
  }
  
  // Helius keys - typically 32-64 alphanumeric characters
  // This is a best guess since Helius keys don't have a specific prefix
  if (/^[a-zA-Z0-9]{32,64}$/.test(trimmed) && !/^AIza/.test(trimmed)) {
    // Could be Helius, but we'll need field name context for better detection
    return APIKeyType.Helius;
  }
  
  return APIKeyType.Generic;
}

/**
 * Detect API key type from field name and key value
 */
export function detectKeyTypeFromContext(fieldName: string, key: string): APIKeyType {
  const lowerFieldName = fieldName.toLowerCase();
  
  // Check field name patterns first
  if (/helius/.test(lowerFieldName)) {
    return APIKeyType.Helius;
  }
  
  if (/gemini/.test(lowerFieldName) || /google.*ai/.test(lowerFieldName)) {
    return APIKeyType.GoogleGemini;
  }
  
  if (/github/.test(lowerFieldName)) {
    return APIKeyType.GitHub;
  }
  
  // Fall back to key pattern detection
  return detectKeyType(key);
}

/**
 * Get all available generators
 */
export function getAllGenerators(): APIKeyGenerator[] {
  return [
    getGeneratorInfo(APIKeyType.GitHub),
    getGeneratorInfo(APIKeyType.Helius),
    getGeneratorInfo(APIKeyType.GoogleGemini),
  ];
}
