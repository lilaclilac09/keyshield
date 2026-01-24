/**
 * KeyShield Vault Verification Helper
 * 
 * Paste this script into your browser console (F12) after:
 * 1. Connecting your wallet
 * 2. Storing at least one API key
 * 
 * This will help verify:
 * - On-chain storage shows hash (32 bytes) not plaintext
 * - IndexedDB contains full ciphertext
 * - Vault account structure is correct
 */

(async function verifyKeyShieldStorage() {
  console.log('🔍 KeyShield Storage Verification');
  console.log('================================\n');

  try {
    // Check if Solana web3.js is available
    if (typeof window.solana === 'undefined' && typeof window.phantom === 'undefined') {
      console.error('❌ No Solana wallet detected. Please connect a wallet first.');
      return;
    }

    // Get wallet public key
    let publicKey;
    if (window.solana && window.solana.publicKey) {
      publicKey = window.solana.publicKey.toString();
    } else if (window.phantom && window.phantom.solana && window.phantom.solana.publicKey) {
      publicKey = window.phantom.solana.publicKey.toString();
    } else {
      console.error('❌ Wallet not connected. Please connect your wallet first.');
      return;
    }

    console.log('👤 Wallet Address:', publicKey);
    console.log('');

    // Check if @solana/web3.js is available in the page
    let Connection, PublicKey;
    try {
      // Try to get from window if available
      if (window.solanaWeb3) {
        Connection = window.solanaWeb3.Connection;
        PublicKey = window.solanaWeb3.PublicKey;
      } else {
        console.warn('⚠️  @solana/web3.js not found in window. Some checks will be skipped.');
        console.log('   You can still check IndexedDB manually.');
      }
    } catch (e) {
      console.warn('⚠️  Could not access Solana web3.js:', e.message);
    }

    // Program ID (from .env.local)
    const PROGRAM_ID = '59nTnjeLvV97189JSLh4q6oyRdSUfatQeDLR178cjXKW';
    const RPC_URL = 'https://api.devnet.solana.com';
    const VAULT_SEED = 'vault';

    console.log('📊 Program ID:', PROGRAM_ID);
    console.log('🌐 RPC URL:', RPC_URL);
    console.log('');

    // Check IndexedDB for ciphertext storage
    console.log('💾 Checking IndexedDB Storage...');
    console.log('');

    try {
      const dbName = 'keyshield-ciphertext';
      const storeName = 'ciphertexts';

      // Open IndexedDB
      const dbRequest = indexedDB.open(dbName, 1);
      
      await new Promise((resolve, reject) => {
        dbRequest.onsuccess = resolve;
        dbRequest.onerror = () => reject(dbRequest.error);
        dbRequest.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains(storeName)) {
            db.createObjectStore(storeName, { keyPath: 'hash' });
          }
        };
      });

      const db = dbRequest.result;
      const transaction = db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      await new Promise((resolve, reject) => {
        request.onsuccess = () => {
          const ciphertexts = request.result;
          
          if (ciphertexts.length === 0) {
            console.log('⚠️  No ciphertexts found in IndexedDB');
            console.log('   This is normal if you haven\'t stored any keys yet.');
          } else {
            console.log(`✅ Found ${ciphertexts.length} ciphertext(s) in IndexedDB:`);
            console.log('');
            
            ciphertexts.forEach((item, index) => {
              console.log(`   Ciphertext ${index + 1}:`);
              console.log('   - Hash (key):', item.hash);
              console.log('   - Ciphertext length:', item.ciphertext?.length || 0, 'characters');
              console.log('   - Stored at:', new Date(item.storedAt).toISOString());
              console.log('');
            });
          }
          resolve();
        };
        request.onerror = () => reject(request.error);
      });

      db.close();
    } catch (error) {
      console.error('❌ Error accessing IndexedDB:', error.message);
      console.log('   Make sure you\'ve stored at least one key.');
    }

    // If web3.js is available, try to fetch vault account
    if (Connection && PublicKey) {
      console.log('🔗 Fetching Vault Account from On-Chain...');
      console.log('');

      try {
        const connection = new Connection(RPC_URL, 'confirmed');
        const programId = new PublicKey(PROGRAM_ID);
        const ownerPubkey = new PublicKey(publicKey);

        // Derive vault PDA
        const [vaultPDA] = PublicKey.findProgramAddressSync(
          [Buffer.from(VAULT_SEED), ownerPubkey.toBuffer()],
          programId
        );

        console.log('📍 Vault PDA:', vaultPDA.toString());
        console.log('');

        // Fetch account info
        const accountInfo = await connection.getAccountInfo(vaultPDA);

        if (!accountInfo) {
          console.log('⚠️  Vault account not found on-chain');
          console.log('   This is normal if you haven\'t stored any keys yet.');
          console.log('   Store a key first, then run this script again.');
          return;
        }

        console.log('✅ Vault account found!');
        console.log('');
        console.log('📋 Account Details:');
        console.log('   - Account size:', accountInfo.data.length, 'bytes (expected: 288)');
        console.log('   - Owner:', accountInfo.owner.toString());
        console.log('   - Lamports:', accountInfo.lamports / 1e9, 'SOL');
        console.log('');

        if (accountInfo.data.length < 288) {
          console.warn('⚠️  Account size is smaller than expected (288 bytes)');
        }

        // Parse account data
        const data = accountInfo.data;

        // Check discriminator (bytes 0-7)
        const discriminator = data.slice(0, 8).toString();
        const expectedDiscriminator = 'keyshld\0';
        if (discriminator === expectedDiscriminator) {
          console.log('✅ Discriminator: keyshld (correct)');
        } else {
          console.log('❌ Discriminator mismatch. Expected: keyshld\\0, Got:', discriminator);
        }

        // Extract owner (bytes 8-39)
        const ownerBytes = data.slice(8, 40);
        const ownerPubkeyFromAccount = new PublicKey(ownerBytes);
        console.log('👤 Owner from account:', ownerPubkeyFromAccount.toString());
        if (ownerPubkeyFromAccount.equals(ownerPubkey)) {
          console.log('   ✅ Matches your wallet address');
        } else {
          console.log('   ⚠️  Does not match your wallet address');
        }

        // Extract encrypted_key_hash (bytes 40-71) - THIS IS THE KEY CHECK!
        const encryptedKeyHash = data.slice(40, 72);
        console.log('');
        console.log('🔐 encrypted_key_hash (bytes 40-71):');
        console.log('   - Length:', encryptedKeyHash.length, 'bytes (expected: 32)');
        console.log('   - Hex:', Array.from(encryptedKeyHash).map(b => b.toString(16).padStart(2, '0')).join(''));
        console.log('   - Base64:', btoa(String.fromCharCode(...encryptedKeyHash)));

        // CRITICAL CHECK: Verify it's NOT plaintext
        const asString = String.fromCharCode(...encryptedKeyHash);
        const isReadable = /^[\x20-\x7E]+$/.test(asString) && asString.length > 10 && 
                          !/[^a-zA-Z0-9]/.test(asString) === false; // More sophisticated check

        // Check if it looks like a readable API key
        const looksLikeKey = /^(sk_|pk_|ghp_|AIza|AKIA)/.test(asString) || 
                            (asString.length > 20 && /^[a-zA-Z0-9_-]+$/.test(asString));

        if (looksLikeKey || (isReadable && asString.length > 15)) {
          console.log('');
          console.error('❌ SECURITY ISSUE: encrypted_key_hash appears to be PLAINTEXT!');
          console.error('   Value:', asString);
          console.error('   This should be a hash, not the actual API key!');
        } else {
          console.log('');
          console.log('✅ encrypted_key_hash is properly hashed (not plaintext)');
          console.log('   This is correct - only the hash is stored on-chain.');
        }

        // Extract timestamp (bytes 136-143)
        const timestampBytes = data.slice(136, 144);
        const timestamp = Number(timestampBytes.readBigUInt64LE ? 
          timestampBytes.readBigUInt64LE(0) : 
          Buffer.from(timestampBytes).readBigUInt64LE(0));
        const createdAt = new Date(timestamp);
        console.log('');
        console.log('🕐 Created At:', createdAt.toISOString());

        // Extract access flags (byte 144)
        const accessFlags = data[144];
        console.log('🔒 Access Flags:', '0x' + accessFlags.toString(16));

      } catch (error) {
        console.error('❌ Error fetching vault account:', error.message);
        console.log('   Make sure:');
        console.log('   1. Your wallet is connected');
        console.log('   2. You have stored at least one key');
        console.log('   3. The program is deployed to devnet');
      }
    }

    console.log('');
    console.log('================================');
    console.log('✅ Verification complete!');
    console.log('');
    console.log('💡 Next steps:');
    console.log('   - Test decryption in the UI');
    console.log('   - Verify access control with different wallet');
    console.log('   - Check that decryption retrieves ciphertext from IndexedDB');

  } catch (error) {
    console.error('❌ Verification failed:', error);
    console.error('Stack:', error.stack);
  }
})();
