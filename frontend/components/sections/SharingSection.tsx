import React from 'react';
import { Share2 } from 'lucide-react';
import { Placeholder } from '../ui/Placeholder';

export const SharingSection: React.FC = () => (
  <Placeholder
    icon={<Share2 size={20} className="text-[#5b8cff]" strokeWidth={1.75} />}
    title="Nothing shared yet"
    body="Share a secret with a teammate via their Solana wallet — re-encrypted end-to-end."
  />
);
