
import React from 'react';

export const THEME = {
  primary: '#ff6200', // Helius Orange
  background: '#131314', // Gemini Dark Mode background
  surface: '#1e1f20', // Gemini Dark Mode surface
  border: '#2e2e30',
  textMuted: '#8e918f',
  text: '#e3e3e3',
};

export const CyberpunkOverlay: React.FC = () => (
  <div className="fixed inset-0 pointer-events-none overflow-hidden z-50 opacity-5">
    <div className="absolute top-6 right-6 text-[7px] font-mono text-white/20 uppercase tracking-[0.5em] leading-none">
      <p>KEYSHIELD_CORE_V4</p>
    </div>
  </div>
);
