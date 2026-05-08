// Mirrors the stone/amber/emerald palette the extension-sync popup uses.
// Kept tiny on purpose — when we want a real theme system this is where
// that work would land.

export const colors = {
  bgPage: '#FAFAF9',          // stone-50
  bgCard: '#FFFFFF',
  bgMuted: '#F5F5F4',         // stone-100
  bgSubtle: '#FAFAF9',        // stone-50

  border: '#E7E5E4',          // stone-200
  borderStrong: '#D6D3D1',    // stone-300

  text: '#1C1917',            // stone-900
  textMuted: '#57534E',       // stone-600
  textFaint: '#A8A29E',       // stone-400
  textHint: '#78716C',        // stone-500

  primaryBg: '#1C1917',       // stone-900
  primaryFg: '#FFFFFF',

  warnBg: '#FFFBEB',          // amber-50
  warnBorder: '#FDE68A',      // amber-200
  warnText: '#92400E',        // amber-800
  warnHeading: '#78350F',     // amber-900
  warnButton: '#B45309',      // amber-700

  okBg: '#ECFDF5',            // emerald-50
  okBorder: '#A7F3D0',        // emerald-200
  okText: '#047857',          // emerald-700

  errBg: '#FEF2F2',           // red-50
  errText: '#B91C1C',         // red-700
  errStrong: '#DC2626',       // red-600
  errStronger: '#991B1B',     // red-800

  scrim: 'rgba(28, 25, 23, 0.4)',
};

export const radius = {
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  pill: 999,
};

export const space = {
  xs: 4,
  s: 8,
  m: 12,
  l: 16,
  xl: 24,
};

export const fontSize = {
  xxs: 10,
  xs: 11,
  s: 12,
  m: 13,
  l: 15,
  xl: 18,
  xxl: 24,
};
