import React, { useState } from 'react';
import { Puzzle } from 'lucide-react';
import { REPO_URL } from '../lib/version';

const EXT_DIR = 'src/extension';
const CHROME_PAGE = 'chrome://extensions';
const FOLDER_URL = `${REPO_URL}/tree/main/src/extension`;

interface Props {
  variant: 'auth' | 'home';
  onOpenDocs?: () => void;
}

export const ExtensionInstallHint: React.FC<Props> = ({ variant, onOpenDocs }) => {
  const [copied, setCopied] = useState<'page' | 'path' | null>(null);

  const copy = async (text: string, which: 'page' | 'path') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      /* clipboard may be denied */
    }
  };

  const compact = variant === 'auth';

  return (
    <div
      className={`w-full text-left rounded-xl border border-[#243365] bg-[#131c39] ${compact ? 'p-4 mt-8' : 'p-5'}`}
      data-testid="chrome-extension-hint"
    >
      <div className="flex items-start gap-2">
        <Puzzle size={compact ? 14 : 18} className="text-white shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className={`${compact ? 'text-[13px]' : 'text-[16px]'} font-semibold text-white`}>
            Chrome extension <span className="text-[#93b4ff] font-medium">(preferred)</span>
          </p>
          <p className={`${compact ? 'text-[12px] mt-1' : 'text-[14px] mt-1.5'} text-[#a8b3d8] leading-relaxed`}>
            Auto-detects API keys on OpenAI, Anthropic, OpenRouter, Groq, Helius pages and offers Save to vault. There is no Chrome Web Store listing yet — load unpacked from the repo. Use Chrome (Edge / Brave / Arc also work).
          </p>
        </div>
      </div>
      <ol className={`${compact ? 'mt-3 space-y-1.5 text-[12px]' : 'mt-4 space-y-2 text-[14px]'} list-decimal list-inside text-[#e8ecff]`}>
        <li>
          Open{' '}
          <code className="text-white">{CHROME_PAGE}</code>
          <button
            type="button"
            onClick={() => void copy(CHROME_PAGE, 'page')}
            className="ml-2 text-[11px] text-[#93b4ff] hover:underline"
          >
            {copied === 'page' ? 'Copied' : 'Copy'}
          </button>
        </li>
        <li>Turn on <strong className="text-white">Developer mode</strong>, then <strong className="text-white">Load unpacked</strong>.</li>
        <li>
          Select folder{' '}
          <code className="text-white">{EXT_DIR}</code>
          {' '}(<code className="text-white">manifest.json</code> inside).{' '}
          <a href={FOLDER_URL} target="_blank" rel="noreferrer" className="text-[#93b4ff] hover:underline">Open on GitHub</a>
          <button
            type="button"
            onClick={() => void copy(EXT_DIR, 'path')}
            className="ml-2 text-[11px] text-[#93b4ff] hover:underline"
          >
            {copied === 'path' ? 'Copied' : 'Copy path'}
          </button>
        </li>
        <li>Pin the KeyShield icon, then sign in here so the popup gets a session token.</li>
      </ol>
      <p className={`${compact ? 'text-[11px] mt-2' : 'text-[13px] mt-3'} text-[#5e6a91] leading-relaxed`}>
        Firefox (not preferred): <code className="text-[#a8b3d8]">about:debugging</code> → This Firefox → Load Temporary Add-on → <code className="text-[#a8b3d8]">manifest.firefox.json</code>. Temporary loads clear when Firefox quits.
      </p>
      {onOpenDocs && (
        <button
          type="button"
          onClick={onOpenDocs}
          className="mt-3 text-[13px] text-[#93b4ff] hover:underline"
        >
          Full steps in Docs →
        </button>
      )}
    </div>
  );
};
