'use client';

import { useState } from 'react';
import { detectKeyTypeFromContext, APIKeyType, getGeneratorInfo, generateGitHubToken, generateHeliusKey, generateGoogleGeminiKey } from '@/lib/api-key-generators';
import { CheckCircle, XCircle, AlertCircle, Play } from 'lucide-react';

export function AutoDetectionTest() {
  const [testResults, setTestResults] = useState<Array<{
    name: string;
    passed: boolean;
    message: string;
  }>>([]);
  const [testing, setTesting] = useState(false);

  const runTests = async () => {
    setTesting(true);
    const results: Array<{ name: string; passed: boolean; message: string }> = [];

    // Test 1: GitHub token detection
    try {
      const githubToken = 'ghp_123456789012345678901234567890123456';
      const detected = detectKeyTypeFromContext('', githubToken);
      results.push({
        name: 'GitHub Token Detection',
        passed: detected === APIKeyType.GitHub,
        message: detected === APIKeyType.GitHub ? 'Correctly detected GitHub token' : `Expected GitHub, got ${detected}`,
      });
    } catch (error: any) {
      results.push({
        name: 'GitHub Token Detection',
        passed: false,
        message: error.message,
      });
    }

    // Test 2: Google Gemini key detection
    try {
      const geminiKey = 'AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz1234567';
      const detected = detectKeyTypeFromContext('', geminiKey);
      results.push({
        name: 'Google Gemini Key Detection',
        passed: detected === APIKeyType.GoogleGemini,
        message: detected === APIKeyType.GoogleGemini ? 'Correctly detected Google Gemini key' : `Expected GoogleGemini, got ${detected}`,
      });
    } catch (error: any) {
      results.push({
        name: 'Google Gemini Key Detection',
        passed: false,
        message: error.message,
      });
    }

    // Test 3: Helius key detection (by field name)
    try {
      const heliusKey = 'abcdef1234567890abcdef1234567890abcdef12';
      const detected = detectKeyTypeFromContext('helius_api_key', heliusKey);
      results.push({
        name: 'Helius Key Detection (by field name)',
        passed: detected === APIKeyType.Helius,
        message: detected === APIKeyType.Helius ? 'Correctly detected Helius key' : `Expected Helius, got ${detected}`,
      });
    } catch (error: any) {
      results.push({
        name: 'Helius Key Detection',
        passed: false,
        message: error.message,
      });
    }

    // Test 4: Generator info
    try {
      const githubInfo = getGeneratorInfo(APIKeyType.GitHub);
      results.push({
        name: 'Generator Info',
        passed: githubInfo.name.includes('GitHub'),
        message: githubInfo.name.includes('GitHub') ? 'Generator info correct' : 'Generator info incorrect',
      });
    } catch (error: any) {
      results.push({
        name: 'Generator Info',
        passed: false,
        message: error.message,
      });
    }

    // Test 5: Clipboard simulation (manual test)
    results.push({
      name: 'Clipboard Detection',
      passed: true,
      message: 'Manual test: Copy an API key to clipboard and check Dashboard',
    });

    setTestResults(results);
    setTesting(false);
  };

  return (
    <div className="bg-[#111] border border-white/5 rounded-lg p-6 cyber-glow">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Auto-Detection Test Suite</h3>
        <button
          onClick={runTests}
          disabled={testing}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          <Play className="w-4 h-4" />
          {testing ? 'Running...' : 'Run Tests'}
        </button>
      </div>

      <div className="space-y-3">
        {testResults.length === 0 ? (
          <p className="text-gray-400 text-sm">Click "Run Tests" to test auto-detection functionality</p>
        ) : (
          testResults.map((result, idx) => (
            <div
              key={idx}
              className={`p-3 rounded-lg border ${
                result.passed
                  ? 'bg-green-500/10 border-green-500/30'
                  : 'bg-red-500/10 border-red-500/30'
              }`}
            >
              <div className="flex items-center gap-2">
                {result.passed ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-500" />
                )}
                <div className="flex-1">
                  <p className="font-semibold text-sm">{result.name}</p>
                  <p className="text-xs text-gray-400 mt-1">{result.message}</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-6 pt-6 border-t border-white/5">
        <h4 className="text-sm font-semibold mb-3">Quick Actions</h4>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={generateGitHubToken}
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs transition-colors"
          >
            Generate GitHub Token
          </button>
          <button
            onClick={generateHeliusKey}
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs transition-colors"
          >
            Generate Helius Key
          </button>
          <button
            onClick={generateGoogleGeminiKey}
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs transition-colors"
          >
            Generate Gemini Key
          </button>
        </div>
      </div>
    </div>
  );
}
