import React from 'react';
export const Logo: React.FC<{ size?: 'sm' | 'lg'; showText?: boolean; className?: string }> = ({ size = 'sm', showText = true, className = '' }) => {
  const dims = size === 'lg' ? { w: 48, h: 48, text: 'text-2xl' } : { w: 20, h: 20, text: 'text-[15px]' };
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg width={dims.w} height={dims.h} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
        <path d="M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z" stroke="currentColor" strokeWidth="1.5" fill="none" className="text-white" />
        <circle cx="11.5" cy="11" r="2" stroke="currentColor" strokeWidth="1.2" fill="none" className="text-[#a8b3d8]" />
        <line x1="13" y1="12.5" x2="16" y2="15.5" stroke="currentColor" strokeWidth="1.2" className="text-[#a8b3d8]" />
        <line x1="15" y1="14.5" x2="16" y2="13.5" stroke="currentColor" strokeWidth="1.2" className="text-[#a8b3d8]" />
        <line x1="15.5" y1="15" x2="16.5" y2="14" stroke="currentColor" strokeWidth="1.2" className="text-[#a8b3d8]" />
      </svg>
      {showText && <span className={`${dims.text} font-bold tracking-tight text-white uppercase`}>KeyShield</span>}
    </div>
  );
};
