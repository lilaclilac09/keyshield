/**
 * Wallet Connection Test Script
 * 
 * Paste this into browser console (F12) to test wallet connection
 */

(async function testWalletConnection() {
  console.log('🔌 Wallet Connection Test');
  console.log('========================\n');

  // 1. Check if wallet adapters are available
  console.log('1️⃣ Checking Wallet Adapters...');
  
  // Check for browser wallet extensions
  const hasPhantom = typeof window.phantom !== 'undefined' || typeof window.solana !== 'undefined';
  const hasSolflare = typeof window.solflare !== 'undefined';
  
  console.log('   Phantom detected:', hasPhantom);
  console.log('   Solflare detected:', hasSolflare);
  console.log('   Window.solana:', typeof window.solana);
  console.log('');

  // 2. Check if wallet is connected
  console.log('2️⃣ Checking Current Connection...');
  if (window.solana && window.solana.publicKey) {
    console.log('✅ Wallet connected:', window.solana.publicKey.toString());
    console.log('   Network:', window.solana.isConnected ? 'Connected' : 'Disconnected');
  } else {
    console.log('❌ No wallet connected');
  }
  console.log('');

  // 3. Test wallet connection
  console.log('3️⃣ Testing Wallet Connection...');
  if (window.solana && window.solana.isPhantom) {
    try {
      const response = await window.solana.connect();
      console.log('✅ Phantom connected:', response.publicKey.toString());
    } catch (error) {
      console.error('❌ Phantom connection failed:', error.message);
    }
  } else {
    console.log('⚠️  Phantom not detected. Try using Burner wallet from the UI.');
  }
  console.log('');

  // 4. Check RPC connection
  console.log('4️⃣ Checking RPC Connection...');
  try {
    // Try to use the app's connection if available
    if (window.__NEXT_DATA__) {
      console.log('✅ Next.js app detected');
    }
    
    // Check if we can access Solana web3
    if (typeof window.solanaWeb3 !== 'undefined') {
      const { Connection } = window.solanaWeb3;
      const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
      const version = await connection.getVersion();
      console.log('✅ RPC connection successful');
      console.log('   Solana version:', version['solana-core']);
    } else {
      console.log('⚠️  @solana/web3.js not available in window');
      console.log('   This is normal - the app uses it internally');
    }
  } catch (error) {
    console.error('❌ RPC connection failed:', error.message);
  }
  console.log('');

  // 5. Check wallet adapter state
  console.log('5️⃣ Wallet Adapter State...');
  console.log('   To check adapter state:');
  console.log('   1. Open React DevTools (if installed)');
  console.log('   2. Find WalletProvider component');
  console.log('   3. Check props: wallets, connected, connecting');
  console.log('');

  console.log('========================');
  console.log('✅ Test complete!');
  console.log('');
  console.log('💡 Tips:');
  console.log('   - Use "Burner" wallet for Safari/testing (no extension needed)');
  console.log('   - Install Phantom extension for Chrome/Firefox');
  console.log('   - Check browser console for connection errors');
})();
