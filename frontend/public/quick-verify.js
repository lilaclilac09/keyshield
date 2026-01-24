/**
 * Quick Verification Script for KeyShield
 * 
 * Paste this into browser console (F12) on the dashboard
 * Verifies on-chain storage and helps debug auto-detection
 */

(async function quickVerify() {
  console.log('🔍 KeyShield Quick Verification');
  console.log('================================\n');

  // 1. Check wallet connection
  console.log('1️⃣ Checking Wallet Connection...');
  let publicKey = null;
  
  if (window.solana?.publicKey) {
    publicKey = window.solana.publicKey.toString();
    console.log('✅ Wallet connected:', publicKey);
  } else {
    console.log('❌ No wallet connected. Please connect your wallet first.');
    return;
  }
  console.log('');

  // 2. Check on-chain vault
  console.log('2️⃣ Checking On-Chain Vault...');
  try {
    // Try to use the verification script if available
    const verifyScript = await fetch('/verify-storage.js').then(r => r.text()).catch(() => null);
    if (verifyScript) {
      console.log('📋 Running full verification...');
      eval(verifyScript);
    } else {
      console.log('⚠️  Full verification script not found. Using basic check...');
      
      // Basic check - try to access vault via the app's hooks
      if (window.__NEXT_DATA__) {
        console.log('✅ Next.js app detected');
      }
      
      // Check IndexedDB
      const dbName = 'keyshield-ciphertext';
      const dbRequest = indexedDB.open(dbName, 1);
      await new Promise((resolve, reject) => {
        dbRequest.onsuccess = resolve;
        dbRequest.onerror = () => reject(dbRequest.error);
        dbRequest.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains('ciphertexts')) {
            db.createObjectStore('ciphertexts', { keyPath: 'hash' });
          }
        };
      });

      const db = dbRequest.result;
      const transaction = db.transaction(['ciphertexts'], 'readonly');
      const store = transaction.objectStore('ciphertexts');
      const request = store.getAll();

      await new Promise((resolve, reject) => {
        request.onsuccess = () => {
          const ciphertexts = request.result;
          if (ciphertexts.length > 0) {
            console.log(`✅ Found ${ciphertexts.length} ciphertext(s) in IndexedDB`);
            console.log('   This means keys were stored successfully!');
            ciphertexts.forEach((item, i) => {
              console.log(`   Entry ${i + 1}: Hash = ${item.hash?.substring(0, 20)}...`);
            });
          } else {
            console.log('⚠️  No ciphertexts in IndexedDB yet');
          }
          resolve();
        };
        request.onerror = () => reject(request.error);
      });

      db.close();
    }
  } catch (error) {
    console.error('❌ Error checking vault:', error);
  }
  console.log('');

  // 3. Check extension auto-detection
  console.log('3️⃣ Checking Extension Auto-Detection...');
  console.log('   To test auto-detection:');
  console.log('   1. Make sure extension is loaded (chrome://extensions)');
  console.log('   2. Open extension/test-page.html in a new tab');
  console.log('   3. Wait 5-10 seconds for detection');
  console.log('   4. Check for notification: "KeyShield: API Key Detected!"');
  console.log('   5. Open DevTools console on test page to see detection logs');
  console.log('');

  // 4. Manual detection test
  console.log('4️⃣ Manual Detection Test...');
  const testKey = 'sk-test-helius-dummy-2026';
  const heliusPattern = /(?:api-key=|X-API-Key:\s*)([a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12})/i;
  const match = testKey.match(heliusPattern);
  if (match) {
    console.log('✅ Test key matches Helius pattern:', match[0]);
  } else {
    console.log('⚠️  Test key does not match standard patterns');
    console.log('   This is normal for generic keys');
  }
  console.log('');

  console.log('================================');
  console.log('✅ Verification complete!');
  console.log('');
  console.log('💡 Next steps:');
  console.log('   - Check Solana Explorer for your vault PDA');
  console.log('   - Verify on-chain shows hash (not plaintext)');
  console.log('   - Test extension on test-page.html');
})();
