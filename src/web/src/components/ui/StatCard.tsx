import React from 'react';

export const StatCard: React.FC<{ label: string; value: React.ReactNode; hint?: string }> = ({ label, value, hint }) => (
  <div className="stat-card">
    <div className="stat-card-label">{label}</div>
    <div className="stat-card-value">{value}</div>
    {hint && <div className="stat-card-hint">{hint}</div>}
  </div>
);
