'use client';

import { Vault } from '@/types';
import { Shield, Lock, Clock, CheckCircle } from 'lucide-react';
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

  return (
    <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-semibold">Secure Vault</h3>
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

      <div className="mt-6 pt-6 border-t border-gray-800">
        <p className="text-xs text-gray-500">
          Your API key is encrypted and stored securely on-chain. Access is verified using zero-knowledge proofs.
        </p>
      </div>
    </div>
  );
}
