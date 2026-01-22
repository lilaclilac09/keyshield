/**
 * AI Agent Integration Hook
 * 
 * This hook integrates with Google AI (Gemini) for intelligent
 * vault management, threat detection, and security recommendations.
 */

import { useState, useEffect, useCallback } from 'react';
import { PublicKey } from '@solana/web3.js';
import {
  initGoogleAI,
  analyzeVaultSecurity,
  getKeyRotationRecommendation,
  getAccessControlRecommendations,
  chatWithAI,
} from '@/lib/google-ai';

interface AIAgentConfig {
  autoRevokeOnThreat?: boolean;
  autoShareWithAgents?: boolean;
  threatDetectionEnabled?: boolean;
  googleAIEnabled?: boolean;
}

interface Threat {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  recommendation: string;
}

export function useAIAgent(config?: AIAgentConfig) {
  const [agentStatus, setAgentStatus] = useState<'idle' | 'monitoring' | 'active' | 'error'>('idle');
  const [threats, setThreats] = useState<Threat[]>([]);
  const [isGoogleAIConnected, setIsGoogleAIConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if Google AI is configured
  useEffect(() => {
    const checkGoogleAI = () => {
      try {
        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_AI_API_KEY;
        if (apiKey) {
          initGoogleAI();
          setIsGoogleAIConnected(true);
          setAgentStatus('active');
        } else {
          setIsGoogleAIConnected(false);
          setAgentStatus('idle');
        }
      } catch (err: any) {
        setError(err.message);
        setIsGoogleAIConnected(false);
        setAgentStatus('error');
      }
    };

    checkGoogleAI();
  }, []);

  // Start monitoring if enabled
  useEffect(() => {
    if (config?.threatDetectionEnabled && isGoogleAIConnected) {
      setAgentStatus('monitoring');
    }
  }, [config, isGoogleAIConnected]);

  const analyzeSecurity = useCallback(async (vaultData: {
    owner: string;
    createdAt: number;
    accessFlags: number;
    shareCount?: number;
  }) => {
    if (!isGoogleAIConnected) {
      throw new Error('Google AI is not connected. Please set NEXT_PUBLIC_GOOGLE_AI_API_KEY.');
    }

    try {
      const analysis = await analyzeVaultSecurity(vaultData);
      
      // Convert to threat format
      const newThreats: Threat[] = analysis.threats.map((threat, index) => ({
        id: `threat-${Date.now()}-${index}`,
        type: 'security',
        severity: analysis.riskLevel,
        description: threat,
        recommendation: analysis.recommendations[0] || 'Review security settings',
      }));

      setThreats(newThreats);
      return analysis;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, [isGoogleAIConnected]);

  const getRotationRecommendation = useCallback(async (keyMetadata: {
    keyName: string;
    createdAt: number;
    lastUsed?: number;
    accessCount?: number;
  }) => {
    if (!isGoogleAIConnected) {
      throw new Error('Google AI is not connected.');
    }

    return await getKeyRotationRecommendation(keyMetadata);
  }, [isGoogleAIConnected]);

  const getAccessRecommendations = useCallback(async (shares: Array<{ recipient: string; timeLock?: number }>) => {
    if (!isGoogleAIConnected) {
      throw new Error('Google AI is not connected.');
    }

    return await getAccessControlRecommendations(shares);
  }, [isGoogleAIConnected]);

  const chat = useCallback(async (message: string, context?: {
    vaultOwner?: string;
    hasVault?: boolean;
    shareCount?: number;
  }) => {
    if (!isGoogleAIConnected) {
      throw new Error('Google AI is not connected.');
    }

    return await chatWithAI(message, context);
  }, [isGoogleAIConnected]);

  const revokeAccess = async (vaultAddress: PublicKey, recipient: PublicKey) => {
    // TODO: Implement auto-revocation via agent
    console.log('Revoking access via AI agent', { vaultAddress, recipient });
  };

  const shareWithAgent = async (vaultAddress: PublicKey, agentPubkey: PublicKey) => {
    // TODO: Implement auto-sharing with AI agents
    console.log('Sharing with AI agent', { vaultAddress, agentPubkey });
  };

  return {
    agentStatus,
    threats,
    isGoogleAIConnected,
    error,
    analyzeSecurity,
    getRotationRecommendation,
    getAccessRecommendations,
    chat,
    revokeAccess,
    shareWithAgent,
  };
}
