
import React from 'react';

export const THEME = {
  // Vibrant Feminine Color Palette
  background: '#0f001f', // Deep midnight navy
  surface: '#1e0a3c', // Rich purple (cards/table rows)
  primary: '#ff2e63', // Hot neon pink (primary accent)
  secondary: '#9d4edd', // Electric violet (secondary accent)
  success: '#00f5d4', // Bright turquoise (success badges)
  warning: '#ff9f1c', // Coral (warnings)
  textPrimary: '#ffd6f5', // Light pink-white (primary text)
  textSecondary: '#e0aaff', // Soft purple (secondary text)
  hover: '#c77dff', // Lavender (hover/glow)
  helius: '#ff6200', // Helius orange (for Helius touch)
  border: '#2e2e30',
};

export const CyberpunkOverlay: React.FC = () => (
  <div className="fixed inset-0 pointer-events-none overflow-hidden z-50 opacity-5">
    <div className="absolute top-6 right-6 text-[7px] font-mono text-white/20 uppercase tracking-[0.5em] leading-none">
      <p>KEYSHIELD_CORE_V4</p>
    </div>
  </div>
);
