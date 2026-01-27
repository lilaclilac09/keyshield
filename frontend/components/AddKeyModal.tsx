
import React, { useState, useEffect } from 'react';
import { VaultItem } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: Partial<VaultItem>) => void;
  initialData?: Partial<VaultItem>;
}

const PROVIDERS = [
  { id: 'custom', name: 'CUSTOM_NODE', domain: '' },
  { id: 'openai', name: 'OPENAI_AI', domain: 'openai.com' },
  { id: 'helius', name: 'HELIUS_RPC', domain: 'helius.dev' },
  { id: 'github', name: 'GITHUB_DEV', domain: 'github.com' },
  { id: 'stripe', name: 'STRIPE_FIN', domain: 'stripe.com' },
  { id: 'alchemy', name: 'ALCHEMY_RPC', domain: 'alchemy.com' },
  { id: 'quicknode', name: 'QUICKNODE_RPC', domain: 'quicknode.com' },
  { id: '0x', name: 'ZEROX_PROTOCOL', domain: '0x.org' },
  { id: 'bloxroute', name: 'BLOXROUTE_DEV', domain: 'bloxroute.com' },
];

export const AddKeyModal: React.FC<Props> = ({ isOpen, onClose, onSave, initialData }) => {
  const [name, setName] = useState('');
  const [provider, setProvider] = useState(PROVIDERS[0]);
  const [value, setValue] = useState('');
  const [showValue, setShowValue] = useState(false);
  const [expiryDate, setExpiryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [isEncrypting, setIsEncrypting] = useState(false);

  useEffect(() => {
    if (isOpen && initialData) {
      if (initialData.name) setName(initialData.name);
      if (initialData.value) setValue(initialData.value);
      if (initialData.domain) {
        const found = PROVIDERS.find(p => p.domain === initialData.domain || initialData.name?.toLowerCase().includes(p.name.toLowerCase()));
        if (found) setProvider(found);
      }
      if (initialData.notes) setNotes(initialData.notes);
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !value) return;

    setIsEncrypting(true);
    setTimeout(() => {
      onSave({
        name,
        domain: provider.domain,
        value,
        expiryDate,
        notes,
        type: 'api_key',
        tags: [provider.name.split('_')[0], 'SECURE']
      });
      setIsEncrypting(false);
      resetForm();
      onClose();
    }, 1500);
  };

  const resetForm = () => {
    setName('');
    setProvider(PROVIDERS[0]);
    setValue('');
    setShowValue(false);
    setExpiryDate('');
    setNotes('');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 font-mono">
      <div 
        className="absolute inset-0 bg-[#0f001f]/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-lg bg-[#1e0a3c] border border-[#9d4edd]/30 rounded-lg shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-8 border-b border-[#9d4edd]/20 bg-gradient-to-r from-[#ff2e63]/10 to-[#9d4edd]/10">
          <div className="flex flex-col">
            <h2 className="text-lg font-bold text-[#ffd6f5]">Create New Key</h2>
            <p className="text-xs text-[#e0aaff]/70 mt-1">Encrypted storage with Lit Protocol v4</p>
          </div>
          <button 
            onClick={onClose}
            className="text-[#e0aaff]/60 hover:text-[#ff2e63] transition-colors p-2 hover:bg-[#ff2e63]/10 rounded-lg"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-[#e0aaff]">Key Name</label>
            <input 
              required
              placeholder="e.g. Production API Key"
              className="w-full bg-[#0f001f] border border-[#9d4edd]/20 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#ff2e63]/50 focus:ring-2 focus:ring-[#ff2e63]/20 transition-all placeholder:text-[#e0aaff]/30 text-[#ffd6f5]"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#e0aaff]">Provider</label>
              <select 
                className="w-full bg-[#0f001f] border border-[#9d4edd]/20 rounded-lg px-4 py-3 text-sm appearance-none focus:outline-none focus:border-[#ff2e63]/50 focus:ring-2 focus:ring-[#ff2e63]/20 transition-all cursor-pointer text-[#ffd6f5]"
                value={provider.id}
                onChange={(e) => {
                  const found = PROVIDERS.find(p => p.id === e.target.value);
                  if (found) setProvider(found);
                }}
              >
                {PROVIDERS.map(p => (
                  <option key={p.id} value={p.id} className="bg-[#1e0a3c]">{p.name.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-[#e0aaff]">Expiry Date (Optional)</label>
              <input 
                type="date"
                className="w-full bg-[#0f001f] border border-[#9d4edd]/20 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#ff2e63]/50 focus:ring-2 focus:ring-[#ff2e63]/20 transition-all [color-scheme:dark] text-[#ffd6f5]"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-[#e0aaff]">Secret Key</label>
            <div className="relative">
              <input 
                required
                type={showValue ? 'text' : 'password'}
                placeholder="Enter your API key"
                className="w-full bg-[#0f001f] border border-[#9d4edd]/20 rounded-lg px-4 py-3 pr-20 text-sm focus:outline-none focus:border-[#ff2e63]/50 focus:ring-2 focus:ring-[#ff2e63]/20 transition-all placeholder:text-[#e0aaff]/30 text-[#ffd6f5]"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
              <button 
                type="button"
                onClick={() => setShowValue(!showValue)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-medium text-[#e0aaff]/60 hover:text-[#ff2e63] transition-colors"
              >
                {showValue ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-[#e0aaff]">Notes (Optional)</label>
            <textarea 
              placeholder="Add any additional notes..."
              rows={3}
              className="w-full bg-[#0f001f] border border-[#9d4edd]/20 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#ff2e63]/50 focus:ring-2 focus:ring-[#ff2e63]/20 transition-all placeholder:text-[#e0aaff]/30 resize-none text-[#ffd6f5]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="pt-6 flex items-center justify-between border-t border-[#9d4edd]/20">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-[#e0aaff]/50">Encryption: AES-256-GCM</span>
              <span className="text-xs text-[#e0aaff]/50">Protocol: Lit Protocol v4</span>
            </div>
            <button 
              type="submit"
              disabled={isEncrypting || !name || !value}
              className="bg-gradient-to-r from-[#ff2e63] to-[#9d4edd] hover:from-[#ff2e63]/90 hover:to-[#9d4edd]/90 disabled:from-[#1e0a3c] disabled:to-[#1e0a3c] disabled:text-[#e0aaff]/30 text-white text-sm font-medium px-8 py-3 rounded-lg transition-all shadow-[0_0_15px_rgba(255,46,99,0.3)] hover:shadow-[0_0_20px_rgba(255,46,99,0.5)]"
            >
              {isEncrypting ? 'Encrypting...' : 'Create Key'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
