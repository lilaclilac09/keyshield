
import React from 'react';
import { Shield } from 'lucide-react';

interface Props {
  onAuthenticated: () => void;
}

export const AuthScreen: React.FC<Props> = ({ onAuthenticated }) => {
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/578c6ea9-707c-43da-8c19-a1de0e50bb6b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'frontend/components/AuthScreen.tsx:13',message:'auth_screen_render',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'pre',hypothesisId:'H3'})}).catch(()=>{});
  // #endregion
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f001f] via-[#1e0a3c] to-[#0f001f] relative overflow-hidden">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"%3E%3Cg fill="none" fill-rule="evenodd"%3E%3Cg fill="%23ff2e63" fill-opacity="0.03"%3E%3Cpath d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-20"></div>
      
      <div className="relative w-full max-w-sm px-10 py-20 flex flex-col items-center z-10">
        <div className="mb-16 flex flex-col items-center">
          <div className="w-20 h-20 bg-gradient-to-br from-[#ff2e63] to-[#9d4edd] flex items-center justify-center rounded-2xl mb-6 shadow-[0_0_30px_rgba(255,46,99,0.4)]">
            <Shield size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-[#ffd6f5] tracking-tight mb-2">KeyShield</h1>
          <p className="text-sm text-[#e0aaff]/70">Secure API Key Management</p>
        </div>

        <div className="w-full space-y-6">
          <button
            onClick={onAuthenticated}
            className="w-full text-center py-4 bg-gradient-to-r from-[#ff2e63] to-[#9d4edd] hover:from-[#ff2e63]/90 hover:to-[#9d4edd]/90 text-white rounded-lg font-medium text-sm transition-all duration-200 shadow-[0_0_15px_rgba(255,46,99,0.3)] hover:shadow-[0_0_20px_rgba(255,46,99,0.5)]"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
};
