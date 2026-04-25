import React from 'react';
import { createRoot } from 'react-dom/client';
import { installChromeShim } from './chrome-shim';
import { App } from './App';

// In Vite dev / Storybook there's no real `chrome.*` — this is a no-op
// when running as a real extension.
installChromeShim();

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root not found');
createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
