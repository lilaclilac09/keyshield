import React from 'react';

export const Placeholder: React.FC<{ icon: React.ReactNode; title: string; body: string }> = ({ icon, title, body }) => (
  <div className="rounded-2xl border border-[#243365] bg-[#131c39]/60 p-12 flex flex-col items-center justify-center text-center">
    <div className="w-12 h-12 rounded-xl bg-[#0e1430] border border-[#2e4585] flex items-center justify-center mb-4">
      {icon}
    </div>
    <p className="text-[15px] text-white font-medium">{title}</p>
    <p className="text-[13px] text-[#8a96c2] mt-2 max-w-md">{body}</p>
  </div>
);
