'use client';

import { Vault } from '@/types';
import { Shield, Lock, Clock, CheckCircle, Eye, EyeOff, Copy, Check, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useVault } from '@/hooks/useVault';
import { useState, useEffect } from 'react';
import { verifyApiKey, supportsVerification } from '@/lib/api-verifier';
import { APIKeyType } from '@/lib/api-key-generators';
// Note: Install date-fns if needed: npm install date-fns
// For now using simple date formatting
const formatDate = (timestamp: number) => {
  const date = new Date(timestamp);
  return date.toLocaleString();
};

interface VaultDisplayProps {
  vault: Vault;
}

export function VaultDisplay({ vault }: VaultDisplayProps) {
  const createdAt = new Date(vault.createdAt);
  const isTimeLocked = (vault.accessFlags & 0x01) !== 0;
  const { revealKey, revealedKey, isRevealing } = useVault();
  const [isRevealed, setIsRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hideTimeout, setHideTimeout] = useState<NodeJS.Timeout | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{ valid: boolean; message?: string; error?: string } | null>(null);

  // Get key type from vault
  const keyTypeValue = (vault.accessFlags >> 1) & 0x07;
  const keyType = keyTypeValue === 1 ? APIKeyType.GitHub
    : keyTypeValue === 2 ? APIKeyType.Helius
    : keyTypeValue === 3 ? APIKeyType.GoogleGemini
    : APIKeyType.Generic;
  
  const canVerify = supportsVerification(keyType);

  // Get provider icon and badge info
  const getProviderInfo = () => {
    switch (keyType) {
      case APIKeyType.GitHub:
        return { icon: '🔑', name: 'GitHub', color: 'bg-gray-800', badgeColor: 'bg-gray-700' };
      case APIKeyType.Helius:
        return { icon: '⚡', name: 'Helius', color: 'bg-purple-600', badgeColor: 'bg-purple-700' };
      case APIKeyType.GoogleGemini:
        return { icon: '🤖', name: 'Google Gemini', color: 'bg-blue-600', badgeColor: 'bg-blue-700' };
      case APIKeyType.Bloxroute:
        return { icon: '🚀', name: 'bloXroute', color: 'bg-orange-600', badgeColor: 'bg-orange-700' };
      case APIKeyType.ZeroX:
        return { icon: '0x', name: '0x API', color: 'bg-indigo-600', badgeColor: 'bg-indigo-700' };
      default:
        return { icon: '🔐', name: 'API Key', color: 'bg-blue-600', badgeColor: 'bg-blue-700' };
    }
  };

  const providerInfo = getProviderInfo();

  // Sync revealedKey from mutation with local state
  useEffect(() => {
    if (revealedKey && !isRevealed) {
      setIsRevealed(true);
    }
  }, [revealedKey]);

  // Auto-hide after 30 seconds
  useEffect(() => {
    if (isRevealed && revealedKey) {
      // Clear existing timeout
      if (hideTimeout) {
        clearTimeout(hideTimeout);
      }
      
      // Set new timeout
      const timeout = setTimeout(() => {
        setIsRevealed(false);
      }, 30000); // 30 seconds
      
      setHideTimeout(timeout);
      
      return () => {
        if (timeout) clearTimeout(timeout);
      };
    }
  }, [isRevealed, revealedKey]);

  const handleReveal = async () => {
    if (isRevealed) {
      // Hide manually
      setIsRevealed(false);
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        setHideTimeout(null);
      }
    } else {
      // Reveal
      try {
        revealKey(undefined, {
          onSuccess: () => {
            setIsRevealed(true);
          },
          onError: (error) => {
            console.error('Failed to reveal key:', error);
          }
        });
      } catch (error) {
        console.error('Failed to reveal key:', error);
      }
    }
  };

  const handleCopy = async () => {
    if (revealedKey) {
      try {
        await navigator.clipboard.writeText(revealedKey);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (error) {
        console.error('Failed to copy:', error);
      }
    }
  };

  const handleVerify = async () => {
    if (!isRevealed || !revealedKey) {
      // Need to reveal first
      try {
        revealKey(undefined, {
          onSuccess: async (decryptedKey: string) => {
            setIsRevealed(true);
            await performVerification(decryptedKey);
          },
          onError: (error) => {
            console.error('Failed to reveal key for verification:', error);
          }
        });
      } catch (error) {
        console.error('Failed to reveal key:', error);
      }
      return;
    }
    
    await performVerification(revealedKey);
  };

  const performVerification = async (key: string) => {
    setVerifying(true);
    setVerificationResult(null);
    
    try {
      const result = await verifyApiKey(key, keyType);
      setVerificationResult(result);
    } catch (error: any) {
      setVerificationResult({ valid: false, error: error.message || 'Verification failed' });
    } finally {
      setVerifying(false);
    }
  };

  // Get key display (masked or revealed)
  const keyDisplay = isRevealed && revealedKey ? revealedKey : '••••••••••••••••';

  return (
    <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 ${providerInfo.color} rounded-lg flex items-center justify-center text-2xl`}>
            {providerInfo.icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-semibold">Secure Vault</h3>
              <span className={`px-2 py-0.5 ${providerInfo.badgeColor} rounded text-xs font-medium`}>
                {providerInfo.name}
              </span>
            </div>
            <p className="text-sm text-gray-400">Active and protected</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-green-500">
          <CheckCircle className="w-5 h-5" />
          <span className="text-sm font-medium">Protected</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Lock className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-gray-400">Encryption</span>
          </div>
          <p className="text-sm font-mono text-gray-300">
            Lit Protocol ✓
          </p>
        </div>

        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-purple-400" />
            <span className="text-sm text-gray-400">ZK Proof</span>
          </div>
          <p className="text-sm font-mono text-gray-300">
            {Array.from(vault.zkCommit.slice(0, 8))
              .map(b => b.toString(16).padStart(2, '0'))
              .join('')}...
          </p>
        </div>

        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-green-400" />
            <span className="text-sm text-gray-400">MPC Hash</span>
          </div>
          <p className="text-sm font-mono text-gray-300">
            {Array.from(vault.mpcHash.slice(0, 8))
              .map(b => b.toString(16).padStart(2, '0'))
              .join('')}...
          </p>
        </div>

        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-yellow-400" />
            <span className="text-sm text-gray-400">Created</span>
          </div>
          <p className="text-sm text-gray-300">
            {formatDate(vault.createdAt)}
          </p>
        </div>
      </div>

      {isTimeLocked && (
        <div className="bg-yellow-900 bg-opacity-30 border border-yellow-700 rounded-lg p-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-yellow-400" />
          <span className="text-sm text-yellow-200">Time-locked access enabled</span>
        </div>
      )}

      {/* API Key Display with Reveal */}
      <div className="mt-6 pt-6 border-t border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-gray-400">API Key</span>
          <div className="flex items-center gap-2">
            {isRevealed && revealedKey && (
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-800 hover:bg-gray-700 rounded transition-colors"
                title="Copy key"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 text-green-400" />
                    <span className="text-green-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            )}
            {canVerify && (
              <button
                onClick={handleVerify}
                disabled={verifying || isRevealing}
                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded transition-colors"
                title="Verify API key validity"
              >
                {verifying ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Verify</span>
                  </>
                )}
              </button>
            )}
            <button
              onClick={handleReveal}
              disabled={isRevealing}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded transition-colors"
              title={isRevealed ? "Hide key" : "Reveal key (30s)"}
            >
              {isRevealing ? (
                <span>Decrypting...</span>
              ) : isRevealed ? (
                <>
                  <EyeOff className="w-3 h-3" />
                  <span>Hide</span>
                </>
              ) : (
                <>
                  <Eye className="w-3 h-3" />
                  <span>Reveal</span>
                </>
              )}
            </button>
          </div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Lock className="w-4 h-4 text-blue-400" />
            <span className="text-sm text-gray-400">Encrypted Key</span>
          </div>
          <p className="text-sm font-mono text-gray-300 break-all">
            {keyDisplay}
          </p>
          {isRevealed && (
            <p className="text-xs text-yellow-400 mt-2">
              ⚠️ Key will auto-hide in 30 seconds
            </p>
          )}
          {verificationResult && (
            <div className={`mt-3 p-2 rounded flex items-center gap-2 ${
              verificationResult.valid 
                ? 'bg-green-900 bg-opacity-30 border border-green-700' 
                : 'bg-red-900 bg-opacity-30 border border-red-700'
            }`}>
              {verificationResult.valid ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  <span className="text-xs text-green-200">
                    {verificationResult.message || 'Key is valid'}
                  </span>
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 text-red-400" />
                  <span className="text-xs text-red-200">
                    {verificationResult.error || 'Key verification failed'}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 pt-6 border-t border-gray-800">
        <p className="text-xs text-gray-500">
          Your API key is encrypted and stored securely on-chain. Access is verified using zero-knowledge proofs.
        </p>
      </div>
    </div>
  );
}
