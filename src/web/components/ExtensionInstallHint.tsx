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
            The extension saves a key only when you select it or enter it manually. There is no Chrome Web Store listing yet — load unpacked from the repo. Use Chrome (Edge / Brave / Arc also work).
          </p>
          <p className={`${compact ? 'text-[12px] mt-2' : 'text-[14px] mt-2'} text-[#e8ecff] leading-relaxed`}>
            Load the device-local extension from <code className="text-white">src/extension</code>.
            Its encrypted vault is separate from the dashboard Device Vault. No dashboard account, session token or sync is needed.
          </p>
          <div className={`${compact ? 'mt-2' : 'mt-3'} flex flex-wrap gap-2 text-[11px]`}>
            <span className="rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-amber-200">Test build</span>
            <span className="rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-amber-200">Under development</span>
            <span className="rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-amber-200">Not production release</span>
          </div>
          <p className={`${compact ? 'text-[11px] mt-2' : 'text-[12px] mt-2'} text-[#8a96c2] leading-relaxed`}>
            Placeholder links: <a href={`${REPO_URL}/blob/main/DEVELOPMENT.md#mac-app-personal-dmg`} target="_blank" rel="noreferrer" className="text-white hover:underline">Desktop install (placeholder)</a> · <a href={`${REPO_URL}/blob/main/src/extension/README.md#install--firefox--muse-browser-agnostic`} target="_blank" rel="noreferrer" className="text-white hover:underline">Extension install (placeholder)</a>. Verify latest in <a href={`${REPO_URL}/blob/main/CHANGELOG.md`} target="_blank" rel="noreferrer" className="text-white hover:underline">CHANGELOG</a>.
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
        <li>Pin the KeyShield icon and open its popup. Enter a vault passphrase of at least 12 characters, then choose <strong className="text-white">Create / unlock vault</strong>. Keep the passphrase safe: there is no recovery if you forget it.</li>
        <li>On a supported provider page, select one key and choose <strong className="text-white">Save selection to KeyShield</strong>, or type/paste one key in the popup and choose <strong className="text-white">Add key</strong>. Confirm the provider and label, approve the requested site permission, then click <strong className="text-white">Save</strong>.</li>
        <li>To fill a saved key, focus an editable input on the same saved origin, then open the toolbar popup and click <strong className="text-white">Fill into this page</strong>. Nothing is filled automatically.</li>
      </ol>
      <p className={`${compact ? 'text-[11px] mt-2' : 'text-[13px] mt-3'} text-[#5e6a91] leading-relaxed`}>
        Firefox: package a copy of the extension folder using <code className="text-[#a8b3d8]">manifest.firefox.json</code> as <code className="text-[#a8b3d8]">manifest.json</code>, then load that manifest via <code className="text-[#a8b3d8]">about:debugging</code> → This Firefox → Load Temporary Add-on. Temporary loads clear when Firefox quits.
      </p>
      {onOpenDocs && (
        <button
          type="button"
          onClick={onOpenDocs}
          className="mt-3 text-[13px] text-[#93b4ff] hover:underline"
        >
          Open Docs & Troubleshooting
        </button>
      )}
    </div>
  );
};
