import React from 'react';
export const GuillochePattern: React.FC<{ opacity?: number; className?: string }> = ({ opacity = 0.03, className = '' }) => (
  <svg className={`absolute inset-0 w-full h-full pointer-events-none ${className}`} style={{ opacity }} xmlns="http://www.w3.org/2000/svg">
    <defs><pattern id="guilloche" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M0 20 Q10 0 20 20 Q30 40 40 20" fill="none" stroke="white" strokeWidth="0.3" />
      <path d="M0 10 Q10 30 20 10 Q30 -10 40 10" fill="none" stroke="white" strokeWidth="0.2" />
      <circle cx="20" cy="20" r="3" fill="none" stroke="white" strokeWidth="0.2" />
      <circle cx="20" cy="20" r="6" fill="none" stroke="white" strokeWidth="0.15" />
    </pattern></defs>
    <rect width="100%" height="100%" fill="url(#guilloche)" />
  </svg>
);
