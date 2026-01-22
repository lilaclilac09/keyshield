/**
 * Google AI (Gemini) Integration
 * 
 * This module provides integration with Google's Gemini API
 * for AI-powered key management and threat detection.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

let genAI: GoogleGenerativeAI | null = null;
let model: any = null;

/**
 * Initialize Google AI client
 */
export function initGoogleAI(): GoogleGenerativeAI {
  if (genAI) {
    return genAI;
  }

  // Try to get API key from environment or localStorage
  let apiKey = process.env.NEXT_PUBLIC_GOOGLE_AI_API_KEY;
  
  // Fallback to localStorage if not in env (for testing)
  if (!apiKey && typeof window !== 'undefined') {
    apiKey = localStorage.getItem('google_ai_api_key') || undefined;
  }
  
  if (!apiKey) {
    throw new Error('Google AI API key is not set. Please add NEXT_PUBLIC_GOOGLE_AI_API_KEY to your .env.local file or connect via the UI.');
  }

  genAI = new GoogleGenerativeAI(apiKey);
  return genAI;
}

/**
 * Get Gemini model instance
 */
export function getGeminiModel(modelName: string = 'gemini-pro') {
  if (model && model.modelName === modelName) {
    return model;
  }

  const client = initGoogleAI();
  model = client.getGenerativeModel({ model: modelName });
  return model;
}

/**
 * Analyze vault security and detect threats
 */
export async function analyzeVaultSecurity(
  vaultData: {
    owner: string;
    createdAt: number;
    accessFlags: number;
    shareCount?: number;
  }
): Promise<{
  threats: string[];
  recommendations: string[];
  riskLevel: 'low' | 'medium' | 'high';
}> {
  const geminiModel = getGeminiModel();

  const prompt = `Analyze this Solana vault security configuration and provide threat analysis:

Vault Owner: ${vaultData.owner}
Created: ${new Date(vaultData.createdAt * 1000).toISOString()}
Access Flags: ${vaultData.accessFlags}
Share Count: ${vaultData.shareCount || 0}

Provide:
1. List of potential security threats (if any)
2. Security recommendations
3. Risk level (low/medium/high)

Format as JSON:
{
  "threats": ["threat1", "threat2"],
  "recommendations": ["rec1", "rec2"],
  "riskLevel": "low|medium|high"
}`;

  try {
    const result = await geminiModel.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    // Fallback parsing
    return {
      threats: [],
      recommendations: ['Enable threat monitoring', 'Review access permissions regularly'],
      riskLevel: 'medium' as const,
    };
  } catch (error) {
    console.error('Google AI analysis error:', error);
    return {
      threats: [],
      recommendations: ['Unable to analyze - check API key configuration'],
      riskLevel: 'medium' as const,
    };
  }
}

/**
 * Generate intelligent key rotation recommendations
 */
export async function getKeyRotationRecommendation(
  keyMetadata: {
    keyName: string;
    createdAt: number;
    lastUsed?: number;
    accessCount?: number;
  }
): Promise<{
  shouldRotate: boolean;
  reason: string;
  priority: 'low' | 'medium' | 'high';
}> {
  const geminiModel = getGeminiModel();

  const ageInDays = Math.floor((Date.now() - keyMetadata.createdAt * 1000) / (1000 * 60 * 60 * 24));

  const prompt = `Should this API key be rotated?

Key Name: ${keyMetadata.keyName}
Age: ${ageInDays} days
Last Used: ${keyMetadata.lastUsed ? new Date(keyMetadata.lastUsed * 1000).toISOString() : 'Never'}
Access Count: ${keyMetadata.accessCount || 0}

Provide recommendation as JSON:
{
  "shouldRotate": true/false,
  "reason": "explanation",
  "priority": "low|medium|high"
}`;

  try {
    const result = await geminiModel.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    // Default recommendation based on age
    return {
      shouldRotate: ageInDays > 90,
      reason: ageInDays > 90 ? 'Key is older than 90 days' : 'Key is still relatively new',
      priority: ageInDays > 180 ? 'high' : ageInDays > 90 ? 'medium' : 'low',
    };
  } catch (error) {
    console.error('Google AI rotation recommendation error:', error);
    return {
      shouldRotate: ageInDays > 90,
      reason: 'Unable to analyze - using default rules',
      priority: ageInDays > 180 ? 'high' : 'medium',
    };
  }
}

/**
 * Generate access control recommendations
 */
export async function getAccessControlRecommendations(
  currentShares: Array<{ recipient: string; timeLock?: number }>
): Promise<string[]> {
  const geminiModel = getGeminiModel();

  const prompt = `Analyze these key shares and provide access control recommendations:

Current Shares: ${JSON.stringify(currentShares, null, 2)}

Provide 3-5 specific recommendations for improving access control security.`;

  try {
    const result = await geminiModel.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Extract recommendations (usually bullet points or numbered list)
    const recommendations = text
      .split('\n')
      .filter(line => line.trim().match(/^[-*•\d]/))
      .map(line => line.replace(/^[-*•\d.\s]+/, '').trim())
      .filter(line => line.length > 0);

    return recommendations.length > 0
      ? recommendations
      : ['Review all active shares regularly', 'Implement time-locked access where possible', 'Use ZK proofs for access verification'];
  } catch (error) {
    console.error('Google AI access control recommendations error:', error);
    return [
      'Review all active shares regularly',
      'Implement time-locked access where possible',
      'Use ZK proofs for access verification',
    ];
  }
}

/**
 * Chat with AI about vault management
 */
export async function chatWithAI(
  message: string,
  context?: {
    vaultOwner?: string;
    hasVault?: boolean;
    shareCount?: number;
  }
): Promise<string> {
  const geminiModel = getGeminiModel();

  const contextPrompt = context
    ? `Context: You are helping manage a Solana vault. Owner: ${context.vaultOwner || 'Unknown'}, Has Vault: ${context.hasVault}, Shares: ${context.shareCount || 0}`
    : 'Context: You are helping manage a Solana vault for API key storage.';

  const prompt = `${contextPrompt}

User question: ${message}

Provide a helpful, concise response about vault management, security, or key operations.`;

  try {
    const result = await geminiModel.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Google AI chat error:', error);
    throw new Error('Failed to get AI response. Please check your API key.');
  }
}
