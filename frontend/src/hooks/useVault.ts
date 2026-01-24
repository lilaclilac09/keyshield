import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { useKeyShieldWallet } from './useWallet';
import { KeyShieldClient } from '@/lib/keyshield-client';
import { Vault, StoreKeyParams } from '@/types';
import { encryptWithLit, createWalletAccessConditions, decryptWithLitFromHash, initLitClient } from '@/lib/lit-protocol';
import { getProgramId } from '@/lib/solana';
import { storeCiphertext, hashToKey } from '@/lib/ciphertext-storage';
import { detectKeyTypeFromContext, APIKeyType } from '@/lib/api-key-generators';
import * as LitJsSdk from '@lit-protocol/lit-node-client';

export function useVault(owner?: PublicKey) {
  const { publicKey, connection, sendTransaction } = useKeyShieldWallet();
  const queryClient = useQueryClient();
  const vaultOwner = owner || publicKey;

  let programId;
  try {
    programId = getProgramId();
  } catch (error: any) {
    throw error;
  }

  // Create client only if connection exists (for offline mode, we'll handle gracefully)
  const client = connection ? new KeyShieldClient(connection, programId) : null;

  // Fetch vault data
  const vaultQuery = useQuery({
    queryKey: ['vault', vaultOwner?.toString()],
    queryFn: async (): Promise<Vault | null> => {
      if (!vaultOwner || !client) return null;
      return await client.getVault(vaultOwner);
    },
    enabled: !!vaultOwner && !!client,
    refetchInterval: 5000, // Refetch every 5 seconds
  });

  // Store key mutation
  const storeKeyMutation = useMutation({
    mutationFn: async (params: StoreKeyParams) => {
      if (!publicKey || !sendTransaction || !client) {
        throw new Error('Wallet not connected. Please connect a wallet to store keys.');
      }

      // Encrypt with Lit Protocol
      const accessConditions = createWalletAccessConditions(publicKey.toString());
      const { ciphertext, dataToEncryptHash } = await encryptWithLit(
        params.apiKey,
        accessConditions
      );

      // Store full ciphertext off-chain (IndexedDB)
      // The ciphertext is typically 1-5 KB, too large for on-chain storage
      await storeCiphertext(dataToEncryptHash, ciphertext);

      // Convert hash to bytes for on-chain storage (32 bytes)
      // dataToEncryptHash is a base64 string from Lit Protocol
      const hashBytes = Uint8Array.from(atob(dataToEncryptHash), c => c.charCodeAt(0));

      // Generate ZK commit (placeholder - would use Bonsol)
      const zkCommit = new Uint8Array(32);
      crypto.getRandomValues(zkCommit);

      // Generate MPC hash (placeholder - would use Arcium)
      const mpcHash = new Uint8Array(32);
      crypto.getRandomValues(mpcHash);

      // Detect key type from API key and field name (if available)
      const keyType = params.keyName 
        ? detectKeyTypeFromContext(params.keyName, params.apiKey)
        : detectKeyTypeFromContext('', params.apiKey);
      
      // Map APIKeyType enum to numeric value for on-chain storage
      const keyTypeValue = keyType === APIKeyType.GitHub ? 1
        : keyType === APIKeyType.Helius ? 2
        : keyType === APIKeyType.GoogleGemini ? 3
        : 0; // Generic

      // Build instruction
      // Note: The program will handle account creation if the account doesn't exist
      // For PDAs, account creation must be done by the program using invoke_signed
      const timestamp = Date.now();
      const instruction = await client.buildStoreKeyInstruction(
        publicKey,
        hashBytes, // Store hash on-chain, not full ciphertext
        zkCommit,
        mpcHash,
        timestamp,
        keyTypeValue
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

  // Reveal key mutation (decrypt for temporary display)
  const revealKeyMutation = useMutation({
    mutationFn: async (): Promise<string> => {
      if (!publicKey || !vaultQuery.data) {
        throw new Error('Wallet not connected or vault not found');
      }

      // Get Lit session signatures
      const litClient = await initLitClient();
      
      // Get auth signature
      const authSig = await LitJsSdk.checkAndSignAuthMessage({
        chain: 'solana',
      });

      // Create access conditions
      const accessConditions = createWalletAccessConditions(publicKey.toString());

      // Get session signatures
      const sessionSigs = await litClient.getSessionSigs({
        chain: 'solana',
        expiration: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(), // 24 hours
        resourceAbilityRequests: [
          {
            resource: new LitJsSdk.LitResourceAbilityRequest(
              new LitJsSdk.LitAccessControlConditionResource(accessConditions),
              LitJsSdk.LitAbility.AccessControlConditionDecryption
            ),
          },
        ],
        authNeededCallback: async () => authSig,
      });

      // Decrypt using hash from vault
      const decryptedKey = await decryptWithLitFromHash(
        vaultQuery.data.encryptedKeyHash,
        accessConditions,
        sessionSigs
      );

      return decryptedKey;
    },
    onError: (error: any) => {
      console.error('Reveal key mutation error:', error);
    },
  });

  return {
    vault: vaultQuery.data,
    isLoading: vaultQuery.isLoading,
    error: vaultQuery.error,
    storeKey: storeKeyMutation.mutate,
    isStoring: storeKeyMutation.isPending,
    revealKey: revealKeyMutation.mutate,
    revealedKey: revealKeyMutation.data,
    isRevealing: revealKeyMutation.isPending,
    revealError: revealKeyMutation.error,
  };
}
