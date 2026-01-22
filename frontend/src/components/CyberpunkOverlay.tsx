'use client';

import React from 'react';

export const CyberpunkOverlay: React.FC = () => (
  <div className="fixed inset-0 pointer-events-none overflow-hidden z-50 opacity-40">
    <div className="absolute top-10 right-10 text-[10px] font-mono text-green-500 uppercase tracking-widest leading-none">
      <p>&gt;&gt; Project — Exp 0271</p>
      <p>{'{'}K912 -272100{'}'}</p>
      <p>Manufacturer █ REDCLOUD.®</p>
      <p>Progress ➔ 98%</p>
    </div>
    <div className="absolute bottom-10 left-10 text-[8px] font-mono text-purple-500/50 rotate-90 origin-left">
      SECURE_CONNECTION_STABLE // LIT_PROTOCOL_ACTIVE
    </div>
  </div>
);
