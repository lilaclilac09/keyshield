// MUST be first import — sets globalThis.Buffer before solana web3.js loads.
// See lib/polyfills.ts for why this can't be inline in this file.
import './lib/polyfills';

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initSentry } from './lib/sentry';
import { redirectLocalViteToHostedDashboard } from './lib/host-deploy';
import './index.css';

initSentry();

if (redirectLocalViteToHostedDashboard()) {
  // 127.0.0.1:5173 Sign-in → https://app.ks.aileena.xyz
} else {
  const rootElement = document.getElementById('root');
  if (!rootElement) throw new Error("Could not find root element");
  const root = ReactDOM.createRoot(rootElement);
  root.render(<React.StrictMode><App /></React.StrictMode>);
}
