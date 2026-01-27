
import React from 'react';

// Explicitly define IconProps to include className and other SVG attributes
// This fixes errors where className was reported as missing on IconProps in VaultItemCard.tsx
export interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  className?: string;
}

export const HeliusIcon = ({ size = 20, ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
    <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
    <path d="M9 12H4s.55-3.03 2-5c1.62-2.2 5-4 5-4" />
    <path d="M12 15v5s3.03-.55 5-2c2.2-1.62 4-5 4-5" />
  </svg>
);

export const BloXrouteIcon = ({ size = 20, ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
  </svg>
);

export const ZeroXIcon = ({ size = 20, ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 2l9 5.2v10.4l-9 5.2-9-5.2V7.2L12 2z" />
  </svg>
);

export const QuickNodeIcon = ({ size = 20, ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="3" />
    <circle cx="19" cy="5" r="2" />
    <circle cx="5" cy="19" r="2" />
    <circle cx="19" cy="19" r="2" />
    <circle cx="5" cy="5" r="2" />
    <line x1="7" y1="7" x2="10" y2="10" />
    <line x1="14" y1="14" x2="17" y2="17" />
    <line x1="17" y1="7" x2="14" y2="10" />
    <line x1="10" y1="14" x2="7" y2="17" />
  </svg>
);

export const AlchemyIcon = ({ size = 20, ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M10 2v7.5" />
    <path d="M14 2v7.5" />
    <path d="M8.5 2h7" />
    <path d="M21 22a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 1 1 0 0 1 .27-.67L10 14V9.5h4V14l6.73 7.33A1 1 0 0 1 21 22z" />
  </svg>
);

export const OpenAIIcon = ({ size = 20, ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M9.5 2.5a4.5 4.5 0 0 1 4.5 4.5V17a4.5 4.5 0 0 1-4.5 4.5M14.5 2.5a4.5 4.5 0 0 0-4.5 4.5V17a4.5 4.5 0 0 0 4.5 4.5" />
    <path d="M2.5 9.5a4.5 4.5 0 0 1 4.5 4.5H17a4.5 4.5 0 0 1 4.5-4.5M2.5 14.5a4.5 4.5 0 0 0 4.5-4.5H17a4.5 4.5 0 0 0 4.5 4.5" />
  </svg>
);

export const GitHubIcon = ({ size = 20, ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
  </svg>
);

export const StripeIcon = ({ size = 20, ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2z" />
    <path d="M9 15.5c0 .828.672 1.5 1.5 1.5h3c.828 0 1.5-.672 1.5-1.5s-.672-1.5-1.5-1.5h-3c-.828 0-1.5-.672-1.5-1.5s.672-1.5 1.5-1.5h3c.828 0 1.5.672 1.5 1.5" />
  </svg>
);

export const GenericKeyIcon = ({ size = 20, ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.778-7.778zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3L15.5 7.5z" />
  </svg>
);

// Provider color mapping with vibrant feminine palette
const PROVIDER_COLORS: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  'helius.dev': {
    bg: 'bg-[#ff2e63]/20',
    border: 'border-[#ff2e63]/30',
    text: 'text-[#ff2e63]',
    badge: '#ff2e63', // Hot neon pink
  },
  'openai.com': {
    bg: 'bg-[#00f5d4]/20',
    border: 'border-[#00f5d4]/30',
    text: 'text-[#00f5d4]',
    badge: '#00f5d4', // Bright turquoise
  },
  'github.com': {
    bg: 'bg-[#c77dff]/20',
    border: 'border-[#c77dff]/30',
    text: 'text-[#c77dff]',
    badge: '#c77dff', // Lavender
  },
  'stripe.com': {
    bg: 'bg-[#9d4edd]/20',
    border: 'border-[#9d4edd]/30',
    text: 'text-[#9d4edd]',
    badge: '#9d4edd', // Electric violet
  },
  'alchemy.com': {
    bg: 'bg-[#ff9f1c]/20',
    border: 'border-[#ff9f1c]/30',
    text: 'text-[#ff9f1c]',
    badge: '#ff9f1c', // Coral
  },
  'quicknode.com': {
    bg: 'bg-[#e0aaff]/20',
    border: 'border-[#e0aaff]/30',
    text: 'text-[#e0aaff]',
    badge: '#e0aaff', // Soft purple
  },
  '0x.org': {
    bg: 'bg-[#ff2e63]/20',
    border: 'border-[#ff2e63]/30',
    text: 'text-[#ff2e63]',
    badge: '#ff2e63',
  },
  'bloxroute.com': {
    bg: 'bg-[#9d4edd]/20',
    border: 'border-[#9d4edd]/30',
    text: 'text-[#9d4edd]',
    badge: '#9d4edd',
  },
};

// Default colors
const DEFAULT_COLORS = {
  bg: 'bg-[#1e0a3c]',
  border: 'border-[#9d4edd]/20',
  text: 'text-[#e0aaff]',
  badge: '#e0aaff',
};

export const getProviderIcon = (domain: string): React.ComponentType<IconProps> => {
  const normalizedDomain = domain.toLowerCase();
  
  if (normalizedDomain.includes('helius')) return HeliusIcon;
  if (normalizedDomain.includes('openai')) return OpenAIIcon;
  if (normalizedDomain.includes('github')) return GitHubIcon;
  if (normalizedDomain.includes('stripe')) return StripeIcon;
  if (normalizedDomain.includes('alchemy')) return AlchemyIcon;
  if (normalizedDomain.includes('quicknode')) return QuickNodeIcon;
  if (normalizedDomain.includes('0x') || normalizedDomain.includes('zero')) return ZeroXIcon;
  if (normalizedDomain.includes('bloxroute')) return BloXrouteIcon;
  
  return GenericKeyIcon;
};

export const getProviderColor = (domain: string) => {
  const normalizedDomain = domain.toLowerCase();
  
  for (const [key, colors] of Object.entries(PROVIDER_COLORS)) {
    if (normalizedDomain.includes(key.replace('.com', '').replace('.dev', '').replace('.org', ''))) {
      return colors;
    }
  }
  
  return DEFAULT_COLORS;
};
