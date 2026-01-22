import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { useKeyShieldWallet } from './useWallet';
import { KeyShieldClient } from '@/lib/keyshield-client';
import { Vault, StoreKeyParams } from '@/types';
import { encryptWithLit, createWalletAccessConditions } from '@/lib/lit-protocol';
import { getProgramId } from '@/lib/solana';

export function useVault(owner?: PublicKey) {
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/578c6ea9-707c-43da-8c19-a1de0e50bb6b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useVault.ts:9',message:'useVault called',data:{hasOwner:!!owner},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  const { publicKey, connection, sendTransaction } = useKeyShieldWallet();
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/578c6ea9-707c-43da-8c19-a1de0e50bb6b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useVault.ts:11',message:'Before useQueryClient',data:{hasPublicKey:!!publicKey},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  const queryClient = useQueryClient();
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/578c6ea9-707c-43da-8c19-a1de0e50bb6b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useVault.ts:13',message:'After useQueryClient',data:{hasQueryClient:!!queryClient},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
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
      
      // Note: For PDAs, account creation should be handled by the program
      // The store_key instruction should create the account if it doesn't exist
      // If you get an "AccountNotFound" error, you may need to add account creation
      // logic to the Rust program or pre-create accounts
      
      transaction.add(instruction);

      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      // Send transaction via wallet
      const signature = await sendTransaction(transaction, connection);
      
      // Wait for confirmation
      await connection.confirmTransaction(signature, 'confirmed');

      return signature;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vault', vaultOwner?.toString()] });
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
