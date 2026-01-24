'use client';

import { useState, useEffect } from 'react';
import { useVault } from '@/hooks/useVault';
import { showToast } from './ErrorToast';
import { X, Key, Lock, Clock } from 'lucide-react';
import { detectKeyType, detectKeyTypeFromContext, APIKeyType, getGeneratorInfo } from '@/lib/api-key-generators';

interface StoreKeyFormProps {
  onClose: () => void;
  existingVault?: any;
}

export function StoreKeyForm({ onClose, existingVault }: StoreKeyFormProps) {
  const { storeKey, isStoring } = useVault();
  const [apiKey, setApiKey] = useState('');
  const [keyName, setKeyName] = useState('');
  const [provider, setProvider] = useState<APIKeyType>(APIKeyType.Generic);
  const [timeLocked, setTimeLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-detect provider when API key changes
  useEffect(() => {
    if (apiKey.trim()) {
      const detected = detectKeyType(apiKey);
      setProvider(detected);
      
      // Auto-fill key name if empty
      if (!keyName && detected !== APIKeyType.Generic) {
        const info = getGeneratorInfo(detected);
        setKeyName(info.name);
      }
    }
  }, [apiKey]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!apiKey.trim()) {
      setError('API key is required');
      return;
    }

    try {
      await storeKey({
        apiKey,
        keyName: keyName || 'My API Key',
        timeLocked,
      });
      onClose();
    } catch (err: any) {
      console.error('Store key error:', err);
      // Extract meaningful error message
      let errorMessage = 'Failed to store key';
      if (err.message) {
        errorMessage = err.message;
      } else if (err.toString) {
        errorMessage = err.toString();
      }
      
      // Check for common errors
      if (errorMessage.includes('AccountNotFound') || errorMessage.includes('0x1')) {
        errorMessage = 'Account not found. The vault account needs to be created first. Please try again or contact support.';
      } else if (errorMessage.includes('insufficient funds') || errorMessage.includes('0x1')) {
        errorMessage = 'Insufficient SOL. Please add more SOL to your wallet.';
      } else if (errorMessage.includes('User rejected')) {
        errorMessage = 'Transaction was cancelled.';
      }
      
      setError(errorMessage);
      showToast(errorMessage, 'error');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg max-w-md w-full p-6 border border-gray-800">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <Key className="w-6 h-6" />
            {existingVault ? 'Update API Key' : 'Store API Key'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Provider</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as APIKeyType)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
            >
              <optgroup label="Solana RPC Providers">
                <option value={APIKeyType.Helius}>Helius</option>
                <option value={APIKeyType.QuickNode}>QuickNode</option>
                <option value={APIKeyType.Alchemy}>Alchemy</option>
                <option value={APIKeyType.Ankr}>Ankr</option>
                <option value={APIKeyType.GetBlock}>GetBlock</option>
                <option value={APIKeyType.Chainstack}>Chainstack</option>
              </optgroup>
              <optgroup label="Solana Data APIs">
                <option value={APIKeyType.Shyft}>Shyft</option>
                <option value={APIKeyType.SolanaFM}>SolanaFM</option>
                <option value={APIKeyType.Solscan}>Solscan</option>
              </optgroup>
              <optgroup label="Trading & MEV">
                <option value={APIKeyType.Bloxroute}>bloXroute</option>
                <option value={APIKeyType.ZeroX}>0x API</option>
              </optgroup>
              <optgroup label="Additional Services">
                <option value={APIKeyType.Moralis}>Moralis</option>
                <option value={APIKeyType.Tatum}>Tatum</option>
              </optgroup>
              <optgroup label="Classic APIs">
                <option value={APIKeyType.GitHub}>GitHub</option>
                <option value={APIKeyType.OpenAI}>OpenAI</option>
                <option value={APIKeyType.GoogleGemini}>Google Gemini</option>
                <option value={APIKeyType.Stripe}>Stripe</option>
                <option value={APIKeyType.AWS}>AWS</option>
              </optgroup>
              <optgroup label="Other">
                <option value={APIKeyType.Generic}>Generic</option>
              </optgroup>
            </select>
            {provider !== APIKeyType.Generic && (
              <p className="text-xs text-gray-500 mt-1">
                Auto-detected from key pattern
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Key Name</label>
            <input
              type="text"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="My API Key"
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">API Key</label>
            <textarea
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your API key..."
              rows={4}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500 font-mono text-sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="timeLocked"
              checked={timeLocked}
              onChange={(e) => setTimeLocked(e.target.checked)}
              className="w-4 h-4"
            />
            <label htmlFor="timeLocked" className="flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4" />
              Time-locked access
            </label>
          </div>

          {error && (
            <div className="bg-red-900 bg-opacity-50 border border-red-700 rounded-lg p-3 text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isStoring || !apiKey.trim()}
              className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {isStoring ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Storing...
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  {existingVault ? 'Update' : 'Store'} Key
                </>
              )}
            </button>
          </div>
        </form>

        <div className="mt-6 pt-6 border-t border-gray-800">
          <p className="text-xs text-gray-500">
            Your key will be encrypted with Lit Protocol and stored on-chain with ZK proofs for access verification.
          </p>
        </div>
      </div>
    </div>
  );
}
