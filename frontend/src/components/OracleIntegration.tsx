'use client';

import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { useVault } from '@/hooks/useVault';
import { OracleService, OracleRequest, OracleResult } from '@/lib/oracle-service';
import { getConnection, getProgramId } from '@/lib/solana';
import { APIKeyType } from '@/lib/api-key-generators';
import * as LitJsSdk from '@lit-protocol/lit-node-client';
import { LitAccessControlConditionResource, LitAbility } from '@lit-protocol/auth-helpers';
import { createWalletAccessConditions } from '@/lib/lit-protocol';
import { Zap, Play, CheckCircle, XCircle, Loader } from 'lucide-react';

export function OracleIntegration() {
  const { publicKey, signMessage } = useWallet();
  const { vault } = useVault(publicKey || undefined);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OracleResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [endpoint, setEndpoint] = useState('');
  const [method, setMethod] = useState<'GET' | 'POST' | 'PUT' | 'DELETE'>('GET');
  const [requestBody, setRequestBody] = useState('');

  const getSessionSigs = async (): Promise<any> => {
    if (!publicKey || !signMessage) {
      throw new Error('Wallet not connected or does not support signing');
    }

    const { initLitClient } = await import('@/lib/lit-protocol');
    const litClient = await initLitClient();

    // Get auth signature with nonce
    // Lit Protocol v4 requires nonce - generate it from the client
    const authSig = await LitJsSdk.checkAndSignAuthMessage({
      chain: 'solana',
      nonce: await litClient.getLatestBlockhash(),
    } as any);

    // Create access conditions
    const accessConditions = createWalletAccessConditions(publicKey.toString());

      // Get session signatures
      const sessionSigs = await litClient.getSessionSigs({
        chain: 'solana',
        expiration: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
        resourceAbilityRequests: [
          {
            resource: new LitAccessControlConditionResource(JSON.stringify(accessConditions)),
            ability: LitAbility.AccessControlConditionDecryption,
          },
        ],
        authNeededCallback: async () => authSig,
      });

    return sessionSigs;
  };

  const executeOracleCall = async () => {
    if (!publicKey || !vault) {
      setError('Please connect wallet and ensure vault exists');
      return;
    }

    if (!endpoint.trim()) {
      setError('Please enter an API endpoint');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Get session signatures
      const sessionSigs = await getSessionSigs();

      // Create oracle service
      const connection = getConnection();
      const programId = getProgramId();
      const oracleService = new OracleService(connection, programId, publicKey);

      // Build request
      const request: OracleRequest = {
        vaultOwner: publicKey,
        apiEndpoint: endpoint,
        method,
        body: requestBody ? JSON.parse(requestBody) : undefined,
        sessionSigs,
      };

      // Execute oracle call
      const oracleResult = await oracleService.executeOracleCall(request);
      setResult(oracleResult);
    } catch (err: any) {
      setError(err.message || 'Failed to execute oracle call');
    } finally {
      setLoading(false);
    }
  };

  const getKeyTypeName = (type: APIKeyType): string => {
    switch (type) {
      case APIKeyType.GitHub:
        return 'GitHub';
      case APIKeyType.Helius:
        return 'Helius';
      case APIKeyType.GoogleGemini:
        return 'Google Gemini';
      default:
        return 'Generic';
    }
  };

  if (!publicKey) {
    return (
      <div className="bg-[#111] border border-white/5 rounded-lg p-4">
        <p className="text-gray-400">Please connect your wallet to use oracle service</p>
      </div>
    );
  }

  if (!vault) {
    return (
      <div className="bg-[#111] border border-white/5 rounded-lg p-4">
        <p className="text-gray-400">No vault found. Please store an API key first.</p>
      </div>
    );
  }

  return (
    <div className="bg-[#111] border border-white/5 rounded-lg p-6 cyber-glow">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="w-5 h-5 text-yellow-500" />
        <h3 className="text-lg font-semibold">Oracle Service</h3>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm text-gray-300 mb-1">API Endpoint</label>
          <input
            type="text"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="https://api.github.com/user or /v1/models/gemini-pro"
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-300 mb-1">HTTP Method</label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as any)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="DELETE">DELETE</option>
          </select>
        </div>

        {method !== 'GET' && (
          <div>
            <label className="block text-sm text-gray-300 mb-1">Request Body (JSON)</label>
            <textarea
              value={requestBody}
              onChange={(e) => setRequestBody(e.target.value)}
              placeholder='{"key": "value"}'
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 font-mono text-sm"
              rows={4}
            />
          </div>
        )}

        <button
          onClick={executeOracleCall}
          disabled={loading || !endpoint.trim()}
          className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader className="w-4 h-4 animate-spin" />
              Executing...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Execute Oracle Call
            </>
          )}
        </button>

        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <XCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        )}

        {result && (
          <div className="mt-4 p-4 bg-gray-800 rounded-lg border border-gray-700">
            <div className="flex items-center gap-2 mb-2">
              {result.response.success ? (
                <CheckCircle className="w-5 h-5 text-green-500" />
              ) : (
                <XCircle className="w-5 h-5 text-red-500" />
              )}
              <span className="font-semibold">
                {result.response.success ? 'Success' : 'Failed'}
              </span>
              <span className="text-xs text-gray-400">
                ({getKeyTypeName(result.apiKeyType)} API)
              </span>
            </div>

            {result.response.statusCode && (
              <p className="text-sm text-gray-400 mb-2">
                Status: {result.response.statusCode}
              </p>
            )}

            {result.response.data && (
              <div className="mt-2">
                <p className="text-sm text-gray-300 mb-1">Response:</p>
                <pre className="text-xs bg-black p-2 rounded overflow-auto max-h-64 text-gray-400">
                  {JSON.stringify(result.response.data, null, 2)}
                </pre>
              </div>
            )}

            {result.response.error && (
              <p className="text-sm text-red-400 mt-2">{result.response.error}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
