
import React from 'react';
import { VaultItem } from '../types';
import { VaultRow } from './VaultRow';

interface Props {
  items: VaultItem[];
  onDelete: (id: string) => void;
}

export const VaultTable: React.FC<Props> = ({ items, onDelete }) => {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-6">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#ff2e63]/20 to-[#9d4edd]/20 flex items-center justify-center mb-6">
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-[#ff2e63]"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-[#ffd6f5] mb-2">No keys found</h3>
        <p className="text-sm text-[#e0aaff]/70 text-center max-w-md">
          Get started by creating your first encrypted API key. Your keys are securely stored and encrypted.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[#0f001f] rounded-lg border border-[#1e0a3c]/50 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-[#1e0a3c]/30 border-b border-[#1e0a3c]/50">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-semibold text-[#e0aaff]/70 uppercase tracking-wider">
                Key Name
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-[#e0aaff]/70 uppercase tracking-wider">
                Provider
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-[#e0aaff]/70 uppercase tracking-wider">
                Masked Key
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-[#e0aaff]/70 uppercase tracking-wider">
                Created
              </th>
              <th className="px-6 py-4 text-right text-xs font-semibold text-[#e0aaff]/70 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e0a3c]/30">
            {items.map((item) => (
              <VaultRow key={item.id} item={item} onDelete={onDelete} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
