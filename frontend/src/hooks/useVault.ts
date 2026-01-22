import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { useKeyShieldWallet } from './useWallet';
import { KeyShieldClient } from '@/lib/keyshield-client';
import { Vault, StoreKeyParams } from '@/types';
import { encryptWithLit, createWalletAccessConditions } from '@/lib/lit-protocol';
import { getProgramId } from '@/lib/solana';

export function useVault(owner?: PublicKey) {
  const { publicKey, connection, sendTransaction } = useKeyShieldWallet();
  const queryClient = useQueryClient();
  const vaultOwner = owner || publicKey;

  const client = new KeyShieldClient(connection, getProgramId());

  // Fetch vault data
  const vaultQuery = useQuery({
    queryKey: ['vault', vaultOwner?.toString()],
    queryFn: async (): Promise<Vault | null> => {
      if (!vaultOwner) return null;
      return await client.getVault(vaultOwner);
    },
    enabled: !!vaultOwner,
    refetchInterval: 5000, // Refetch every 5 seconds
  });

  // Store key mutation
  const storeKeyMutation = useMutation({
    mutationFn: async (params: StoreKeyParams) => {
      if (!publicKey || !sendTransaction) {
        throw new Error('Wallet not connected');
      }

      // Encrypt with Lit Protocol
      const accessConditions = createWalletAccessConditions(publicKey.toString());
      const { ciphertext, dataToEncryptHash } = await encryptWithLit(
        params.apiKey,
        accessConditions
      );

      // Convert ciphertext to bytes (truncate/pad to 128 bytes)
      const encryptedKeyBytes = new TextEncoder().encode(ciphertext);
      const encryptedKey = new Uint8Array(128);
      const copyLength = Math.min(encryptedKeyBytes.length, 128);
      encryptedKey.set(encryptedKeyBytes.slice(0, copyLength));

      // Generate ZK commit (placeholder - would use Bonsol)
      const zkCommit = new Uint8Array(32);
      crypto.getRandomValues(zkCommit);

      // Generate MPC hash (placeholder - would use Arcium)
      const mpcHash = new Uint8Array(32);
      crypto.getRandomValues(mpcHash);

      // Build instruction
      // Note: The program will handle account creation if the account doesn't exist
      // For PDAs, account creation must be done by the program using invoke_signed
      const timestamp = Date.now();
      const instruction = await client.buildStoreKeyInstruction(
        publicKey,
        encryptedKey,
        zkCommit,
        mpcHash,
        timestamp
      );

      // Build transaction
      const transaction = new Transaction();
      transaction.add(instruction);

      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      // Send transaction via wallet
      const signature = await sendTransaction(transaction, connection);
      
      // Wait for confirmation with error checking
      const confirmation = await connection.confirmTransaction(signature, 'confirmed');
      
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      return signature;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vault', vaultOwner?.toString()] });
    },
    onError: (error: any) => {
      console.error('Store key mutation error:', error);
    },
  });

  return {
    vault: vaultQuery.data,
    isLoading: vaultQuery.isLoading,
    error: vaultQuery.error,
    storeKey: storeKeyMutation.mutate,
    isStoring: storeKeyMutation.isPending,
  };
}
