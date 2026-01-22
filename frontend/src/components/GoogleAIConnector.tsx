'use client';

import { useState } from 'react';
import { useAIAgent } from '@/hooks/useAIAgent';
import { Bot, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

export function GoogleAIConnector() {
  const { isGoogleAIConnected, error, agentStatus } = useAIAgent();
  const [apiKey, setApiKey] = useState('');
  const [showInput, setShowInput] = useState(!isGoogleAIConnected);

  const handleConnect = async () => {
    if (!apiKey.trim()) {
      alert('Please enter your Google AI API key');
      return;
    }

    // Test the API key first
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
      
      // Test with a simple request
      await model.generateContent('test');
      
      // Store in localStorage for this session
      if (typeof window !== 'undefined') {
        localStorage.setItem('google_ai_api_key', apiKey);
      }

      alert('✅ Google AI connected successfully! The API key is working.\n\nNote: For permanent setup, add NEXT_PUBLIC_GOOGLE_AI_API_KEY to your .env.local file and restart the dev server.');
      
      // Reload to pick up the change
      window.location.reload();
    } catch (error: any) {
      alert(`❌ Connection failed: ${error.message}\n\nPlease check your API key and try again.`);
    }
  };

  const getStatusIcon = () => {
    if (isGoogleAIConnected) {
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    }
    if (error) {
      return <XCircle className="w-5 h-5 text-red-500" />;
    }
    return <AlertCircle className="w-5 h-5 text-yellow-500" />;
  };

  const getStatusText = () => {
    if (isGoogleAIConnected) {
      return 'Connected to Google AI';
    }
    if (error) {
      return `Error: ${error}`;
    }
    return 'Not connected';
  };

  return (
    <div className="bg-[#111] border border-white/5 rounded-lg p-4 cyber-glow hover:border-purple-500/50 transition-all">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-blue-500" />
          <h3 className="font-semibold">Google AI (Gemini)</h3>
        </div>
        {getStatusIcon()}
      </div>

      <p className="text-sm text-gray-400 mb-3">{getStatusText()}</p>

      {!isGoogleAIConnected && (
        <div className="space-y-3">
          {showInput ? (
            <>
              <div>
                <label className="block text-sm text-gray-300 mb-1">
                  Google AI API Key
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your Google AI API key"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Get your API key from{' '}
                  <a
                    href="https://makersuite.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline"
                  >
                    Google AI Studio
                  </a>
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleConnect}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
                >
                  Connect
                </button>
                <button
                  onClick={() => setShowInput(false)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={() => setShowInput(true)}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
            >
              Connect Google AI
            </button>
          )}
        </div>
      )}

      {isGoogleAIConnected && (
        <div className="text-sm text-gray-400">
          <p>Status: <span className="text-green-400">{agentStatus}</span></p>
          <p className="mt-1">AI features enabled: Security analysis, key rotation recommendations, access control suggestions</p>
        </div>
      )}
    </div>
  );
}
