import React from 'react';
import { Puzzle } from 'lucide-react';

interface Props {
  variant: 'auth' | 'home';
  onOpenDocs?: () => void;
}

export const ExtensionInstallHint: React.FC<Props> = ({ variant, onOpenDocs }) => {
  const compact = variant === 'auth';
  return (
    <div className={`w-full text-left rounded-xl border border-[#243365] bg-[#131c39] ${compact ? 'p-4 mt-8' : 'p-5'}`} data-testid="chrome-extension-hint">
      <div className="flex items-start gap-2">
        <Puzzle size={compact ? 14 : 18} className="text-white shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className={`${compact ? 'text-[13px]' : 'text-[16px]'} font-semibold text-white`}>KeyShield extension</p>
          <p className={`${compact ? 'text-[12px] mt-1' : 'text-[14px] mt-1.5'} text-[#a8b3d8] leading-relaxed`}>
            Install the separately distributed, reviewed KeyShield extension build and follow the instructions supplied with that build. This renderer does not bundle that extension build.
          </p>
          <p className={`${compact ? 'text-[12px] mt-2' : 'text-[14px] mt-2'} text-[#e8ecff] leading-relaxed`}>
            The extension saves a key only when you select it or enter it manually. Never copy an account or session token into an extension.
          </p>
        </div>
      </div>
      {onOpenDocs && <button type="button" onClick={onOpenDocs} className="mt-3 text-[13px] text-[#93b4ff] hover:underline">Open Docs & Troubleshooting</button>}
    </div>
  );
};
