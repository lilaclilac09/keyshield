
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

// Add console log to verify script is loading
console.log('🚀 KeyShield: Initializing application...');
// #region agent log
fetch('http://127.0.0.1:7244/ingest/578c6ea9-707c-43da-8c19-a1de0e50bb6b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'frontend/index.tsx:9',message:'init_start',data:{documentReadyState:document.readyState},timestamp:Date.now(),sessionId:'debug-session',runId:'pre',hypothesisId:'H1'})}).catch(()=>{});
// #endregion

const rootElement = document.getElementById('root');
// #region agent log
fetch('http://127.0.0.1:7244/ingest/578c6ea9-707c-43da-8c19-a1de0e50bb6b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'frontend/index.tsx:13',message:'root_element_check',data:{rootElementExists:!!rootElement},timestamp:Date.now(),sessionId:'debug-session',runId:'pre',hypothesisId:'H1'})}).catch(()=>{});
// #endregion
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

console.log('✅ KeyShield: Application mounted successfully');
// #region agent log
fetch('http://127.0.0.1:7244/ingest/578c6ea9-707c-43da-8c19-a1de0e50bb6b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'frontend/index.tsx:26',message:'root_render_called',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'pre',hypothesisId:'H2'})}).catch(()=>{});
// #endregion
