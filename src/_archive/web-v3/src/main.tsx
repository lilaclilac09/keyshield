import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5_000, gcTime: 300_000 },
  },
});

const rootEl = document.getElementById('root');
console.log('[main] Found #root:', rootEl);
if (!rootEl) {
  console.error('[main] ERROR: #root not found!');
  throw new Error('#root not found');
}

// Add a visible marker BEFORE React renders
const debugDiv = document.createElement('div');
debugDiv.style.cssText = 'position:absolute;inset:0;background:#ffffff;display:flex;align-items:center;justify-content:center;font-size:24px;color:#000;font-family:monospace;z-index:9999;text-align:center;';
debugDiv.innerHTML = `<div><div style="font-size:60px;margin-bottom:16px;">🛡</div><div style="font-weight:bold;">React is rendering!</div><div style="font-size:14px;margin-top:8px;color:#555;">Check DevTools Console (F12)</div></div>`;
rootEl.appendChild(debugDiv);

const root = ReactDOM.createRoot(rootEl);
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
console.log('[main] React app mounted successfully');
