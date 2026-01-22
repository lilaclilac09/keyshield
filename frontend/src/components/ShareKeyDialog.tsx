'use client';

import { useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { X, Share2, User } from 'lucide-react';
import { KeyShieldClient } from '@/lib/keyshield-client';
import { useKeyShieldWallet } from '@/hooks/useWallet';
import { Vault } from '@/types';

interface ShareKeyDialogProps {
  vault: Vault;
  onClose: () => void;
}

export function ShareKeyDialog({ vault, onClose }: ShareKeyDialogProps) {
  const { publicKey, connection, sendTransaction } = useKeyShieldWallet();
  const [recipientAddress, setRecipientAddress] = useState('');
  const [timeLock, setTimeLock] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);

  const handleShare = async () => {
    if (!publicKey || !sendTransaction) {
      setError('Wallet not connected');
      return;
    }

    setError(null);
    setIsSharing(true);

    try {
      const recipientPubkey = new PublicKey(recipientAddress);
      const { getProgramId } = await import('@/lib/solana');
      const client = new KeyShieldClient(connection, getProgramId());
      
      const timeLockTimestamp = timeLock 
        ? new Date(timeLock).getTime() 
        : 0; // 0 means no time lock

      const instruction = await client.buildShareKeyInstruction(
        publicKey,
        recipientPubkey,
        timeLockTimestamp
      );

      const { Transaction } = await import('@solana/web3.js');
      const transaction = new Transaction().add(instruction);
      
      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      const signature = await sendTransaction(transaction, connection);
      await connection.confirmTransaction(signature, 'confirmed');

      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to share key');
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg max-w-md w-full p-6 border border-gray-800">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <Share2 className="w-6 h-6" />
            Share API Key
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2 flex items-center gap-2">
              <User className="w-4 h-4" />
              Recipient Wallet Address
            </label>
            <input
              type="text"
              value={recipientAddress}
              onChange={(e) => setRecipientAddress(e.target.value)}
              placeholder="Enter Solana wallet address..."
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500 font-mono text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Time Lock (Optional)
            </label>
            <input
              type="datetime-local"
              value={timeLock}
              onChange={(e) => setTimeLock(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Key will be accessible after this time (MPC sharing)
            </p>
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
              onClick={handleShare}
              disabled={isSharing || !recipientAddress.trim()}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {isSharing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Sharing...
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4" />
                  Share Key
                </>
              )}
            </button>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-gray-800">
          <p className="text-xs text-gray-500">
            Sharing uses Arcium MPC for secure agent-to-agent communication. The recipient will need to provide a ZK proof to access.
          </p>
        </div>
      </div>
    </div>
  );
}
