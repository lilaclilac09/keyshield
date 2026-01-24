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
  OpenAI = 'openai',
  Stripe = 'stripe',
  AWS = 'aws',
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
    case APIKeyType.OpenAI:
      return {
        name: 'OpenAI API Key',
        type: APIKeyType.OpenAI,
        generateUrl: 'https://platform.openai.com/api-keys',
        instructions: '1. Sign in to OpenAI platform\n2. Navigate to API Keys section\n3. Create a new secret key\n4. Copy the key immediately',
      };
    case APIKeyType.Stripe:
      return {
        name: 'Stripe API Key',
        type: APIKeyType.Stripe,
        generateUrl: 'https://dashboard.stripe.com/apikeys',
        instructions: '1. Sign in to Stripe dashboard\n2. Navigate to Developers > API keys\n3. Create or reveal secret key\n4. Copy the key',
      };
    case APIKeyType.AWS:
      return {
        name: 'AWS Access Key',
        type: APIKeyType.AWS,
        generateUrl: 'https://console.aws.amazon.com/iam/home#/security_credentials',
        instructions: '1. Sign in to AWS Console\n2. Navigate to IAM > Security credentials\n3. Create access key\n4. Copy the access key ID and secret',
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
  
  // OpenAI keys (sk- prefix)
  if (/^sk-[a-zA-Z0-9]{32,}$/.test(trimmed)) {
    return APIKeyType.OpenAI;
  }
  
  // Stripe keys (pk_/sk_ prefixes)
  if (/^pk_[a-zA-Z0-9]{24,}$/.test(trimmed) || /^sk_live_[a-zA-Z0-9]{24,}$/.test(trimmed) || /^pk_live_[a-zA-Z0-9]{24,}$/.test(trimmed)) {
    return APIKeyType.Stripe;
  }
  
  // AWS access key IDs
  if (/^AKIA[0-9A-Z]{16}$/.test(trimmed)) {
    return APIKeyType.AWS;
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
  
  if (/openai/.test(lowerFieldName) || /open.*ai/.test(lowerFieldName)) {
    return APIKeyType.OpenAI;
  }
  
  if (/stripe/.test(lowerFieldName)) {
    return APIKeyType.Stripe;
  }
  
  if (/aws/.test(lowerFieldName) || /amazon/.test(lowerFieldName)) {
    return APIKeyType.AWS;
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
