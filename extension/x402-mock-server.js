/**
 * x402 Mock Server — KeyShield devnet testing
 * Simulates x402-protected API endpoints so content.ts interceptor can be tested
 * without spending real USDC.
 *
 * Run: node /tmp/x402-mock-server.js
 * Then: fetch('http://localhost:4020/api/test') → 402 → KeyShield intercepts
 */

const http = require('http');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Payment-Proof, X-Payment-Required, X-Payment-Amount',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const server = http.createServer((req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  // If the request includes X-Payment-Proof header → accept as paid
  if (req.headers['x-payment-proof']) {
    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: 'Payment accepted — here is your data',
      data: { result: 'mock API response', paid: true }
    }));
    return;
  }

  // All endpoints return 402 without proof
  const routes = {
    '/api/search':   { amount: '0.010', memo: 'Exa neural search (mock)' },
    '/api/scrape':   { amount: '0.013', memo: 'Firecrawl scrape (mock)' },
    '/api/enrich':   { amount: '0.050', memo: 'Apollo person enrich (mock)' },
    '/api/generate': { amount: '0.020', memo: 'Image generation (mock)' },
  };

  const route = routes[req.url] || { amount: '0.005', memo: 'Generic x402 endpoint (mock)' };

  res.writeHead(402, {
    ...CORS,
    'Content-Type': 'application/json',
    'X-Payment-Required': 'x402',
    'X-Payment-Amount': route.amount,
    'X-Payment-Memo': route.memo,
    'X-Payment-Network': 'solana-devnet',
    'X-Payment-Recipient': 'KeyShieldDevnet11111111111111111111111111111',
  });
  res.end(JSON.stringify({
    error: 'Payment required',
    payment: { amount: route.amount, memo: route.memo, protocol: 'x402' }
  }));
});

server.listen(4020, () => {
  console.log('x402 mock server running at http://localhost:4020');
  console.log('Endpoints:');
  console.log('  POST /api/search   → $0.010 (Exa search mock)');
  console.log('  POST /api/scrape   → $0.013 (Firecrawl mock)');
  console.log('  POST /api/enrich   → $0.050 (Apollo enrich mock)');
  console.log('  POST /api/generate → $0.020 (Image gen mock)');
  console.log('  POST /api/*        → $0.005 (generic)');
  console.log('\nWith X-Payment-Proof header: returns 200 + data');
});
