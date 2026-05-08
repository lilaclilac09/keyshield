/**
 * OcrScanner — React component for OCR-based API key detection.
 * Uses OCRService (tesseract.js, lazy-loaded) to capture the screen,
 * extract text, and surface any detected API keys for saving to the vault.
 */

import React, { useState, useCallback } from 'react';
import { ScanLine, Loader2, Save, X, AlertTriangle, Camera } from 'lucide-react';
import { ocrService } from '../lib/ocr-service';
import type { DetectedKey } from '../lib/key-detector';

interface OcrScannerProps {
  currentDomain: string;
  /** Called when the user chooses to save a detected key to the vault. */
  onSaveKey: (key: DetectedKey) => void;
}

type ScanState = 'idle' | 'scanning' | 'done' | 'error';

function maskKey(key: string): string {
  if (key.length <= 8) return '••••••••';
  return key.slice(0, 6) + '••••••••' + key.slice(-4);
}

export const OcrScanner: React.FC<OcrScannerProps> = ({ currentDomain, onSaveKey }) => {
  const [scanState, setScanState]     = useState<ScanState>('idle');
  const [results, setResults]         = useState<DetectedKey[]>([]);
  const [errorMsg, setErrorMsg]       = useState('');
  const [savedKeys, setSavedKeys]     = useState<Set<string>>(new Set());
  const [fileInputRef]                = useState(() => React.createRef<HTMLInputElement>());

  const runScan = useCallback(async () => {
    setScanState('scanning');
    setResults([]);
    setErrorMsg('');
    setSavedKeys(new Set());
    try {
      const detected = await ocrService.captureScreenAndDetectKeys(currentDomain);
      setResults(detected);
      setScanState('done');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Screen capture failed';
      // User cancelled the picker — treat as idle, not an error.
      if (msg.toLowerCase().includes('permission denied') || msg.toLowerCase().includes('abort')) {
        setScanState('idle');
      } else {
        setErrorMsg(msg);
        setScanState('error');
      }
    }
  }, [currentDomain]);

  const runFileScan = useCallback(async (file: File) => {
    setScanState('scanning');
    setResults([]);
    setErrorMsg('');
    setSavedKeys(new Set());
    try {
      const detected = await ocrService.extractFromImageFile(file, currentDomain);
      setResults(detected);
      setScanState('done');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Image scan failed';
      setErrorMsg(msg);
      setScanState('error');
    }
  }, [currentDomain]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) runFileScan(file);
    // Reset so same file can be re-selected
    e.target.value = '';
  };

  const handleSave = (key: DetectedKey) => {
    onSaveKey(key);
    setSavedKeys((prev) => new Set(prev).add(key.key));
  };

  const reset = () => {
    setScanState('idle');
    setResults([]);
    setErrorMsg('');
    setSavedKeys(new Set());
  };

  const isScanning = scanState === 'scanning';

  return (
    <div className="rounded-2xl border border-[#1c2238] bg-[#0a0d1a]/60 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 border-b border-[#141a2e] flex items-center justify-between">
        <div>
          <h3 className="text-[13px] font-medium text-white flex items-center gap-2">
            <ScanLine size={13} className="text-[#5b8cff]" />
            OCR Key Scanner
          </h3>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Detect API keys visible in screenshots or screen content
          </p>
        </div>
        {scanState !== 'idle' && (
          <button
            onClick={reset}
            className="text-zinc-500 hover:text-white transition-colors"
            title="Reset"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-4">
        {/* Action row */}
        <div className="flex items-center gap-3">
          <button
            onClick={runScan}
            disabled={isScanning}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#5b8cff] hover:bg-[#7aa1ff] disabled:bg-[#1c2238] disabled:text-zinc-500 text-white text-[13px] font-medium transition-colors"
          >
            {isScanning ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Camera size={14} />
            )}
            {isScanning ? 'Scanning…' : 'Scan Screen for Keys'}
          </button>

          <span className="text-[11px] text-zinc-600">or</span>

          <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-[#1c2238] text-zinc-400 hover:text-white hover:border-[#1c2550] text-[12px] cursor-pointer transition-colors ${isScanning ? 'opacity-50 pointer-events-none' : ''}`}>
            <ScanLine size={13} />
            Scan image file
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
              disabled={isScanning}
            />
          </label>
        </div>

        {/* Scanning state */}
        {isScanning && (
          <div className="flex items-center gap-3 rounded-lg border border-[#1c2238] bg-[#070912] px-4 py-3">
            <Loader2 size={14} className="animate-spin text-[#5b8cff] shrink-0" />
            <div>
              <p className="text-[12px] text-white">Running OCR…</p>
              <p className="text-[10px] text-zinc-500 mt-0.5">
                Select a window or screen in the browser dialog, then wait for analysis.
              </p>
            </div>
          </div>
        )}

        {/* Error state */}
        {scanState === 'error' && (
          <div className="flex items-start gap-3 rounded-lg border border-rose-900/50 bg-rose-950/20 px-4 py-3">
            <AlertTriangle size={14} className="text-rose-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-[12px] text-rose-300 font-medium">Scan failed</p>
              <p className="text-[11px] text-rose-400/80 mt-0.5">{errorMsg}</p>
            </div>
          </div>
        )}

        {/* Results */}
        {scanState === 'done' && (
          <div>
            {results.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-[13px] text-zinc-400">No API keys detected</p>
                <p className="text-[11px] text-zinc-600 mt-1">
                  Try a screenshot containing an API key, .env file, or terminal output.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] text-zinc-500">
                  Found <span className="text-white font-medium">{results.length}</span> key{results.length !== 1 ? 's' : ''}
                </p>
                {results.map((dk, i) => {
                  const saved = savedKeys.has(dk.key);
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-3 rounded-lg border border-[#1c2238] bg-[#070912] px-4 py-3"
                    >
                      <div className="flex-1 min-w-0">
                        {dk.provider && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#5b8cff]/10 border border-[#5b8cff]/30 text-[#5b8cff] font-medium mr-2">
                            {dk.provider}
                          </span>
                        )}
                        <code className="text-[12px] text-zinc-300 font-mono">
                          {maskKey(dk.key)}
                        </code>
                        <div className="text-[10px] text-zinc-600 mt-0.5">
                          source: {dk.source} · domain: {dk.domain}
                        </div>
                      </div>
                      <button
                        onClick={() => handleSave(dk)}
                        disabled={saved}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors shrink-0 ${
                          saved
                            ? 'bg-emerald-950/40 border border-emerald-900/40 text-emerald-400 cursor-default'
                            : 'bg-[#0e1430] border border-[#1c2550] text-[#5b8cff] hover:bg-[#11183a]'
                        }`}
                      >
                        <Save size={11} />
                        {saved ? 'Saved' : 'Save to vault'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Idle hint */}
        {scanState === 'idle' && (
          <p className="text-[11px] text-zinc-700">
            Screen capture requires browser permission. Only the selected window or tab is read —
            nothing is sent to any server.
          </p>
        )}
      </div>
    </div>
  );
};
