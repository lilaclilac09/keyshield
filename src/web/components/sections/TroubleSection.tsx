import React from 'react';
import { AlertCircle } from 'lucide-react';
import { ExtTroubleCase } from '../ExtTroubleCase';
import { LEFTOVER_121_CASE } from '../../lib/ext-trouble';

/** Dedicated Trouble tab. Leftover 1.2.4 never belongs on Home or Docs. */
export const TroubleSection: React.FC = () => (
  <div className="space-y-8" data-testid="trouble-section">
    <div>
      <div className="flex items-center gap-2 text-[11px] text-white mb-1">
        <AlertCircle size={12} />TROUBLE
      </div>
      <h2 className="text-[24px] font-bold text-white uppercase tracking-wider">Troubleshooting</h2>
      <p className="text-[14px] text-[#a8b3d8] mt-1">{LEFTOVER_121_CASE.title}</p>
    </div>
    <ExtTroubleCase variant="docs" />
  </div>
);
