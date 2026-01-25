
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
        className="absolute inset-0 bg-[#131314]/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-lg bg-[#1e1f20] border border-zinc-800/50 rounded-sm shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-8 border-b border-zinc-800/50">
          <div className="flex flex-col">
            <h2 className="text-sm font-bold text-zinc-200 uppercase tracking-widest">INITIALIZE_NEW_RECORD</h2>
            <p className="text-[9px] text-zinc-600 uppercase tracking-[0.4em] font-bold mt-2">Buffer: Encrypted_Storage</p>
          </div>
          <button 
            onClick={onClose}
            className="text-[10px] font-bold text-zinc-600 hover:text-white uppercase tracking-widest transition-colors"
          >
            DISMISS
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div className="space-y-2">
            <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">RECORD_LABEL</label>
            <input 
              required
              placeholder="e.g. PRODUCTION_API_GATEWAY"
              className="w-full bg-[#131314] border border-zinc-800/50 rounded-sm px-4 py-3 text-[11px] focus:outline-none focus:border-zinc-700 transition-all placeholder:text-zinc-800 text-zinc-200 uppercase"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">PROVIDER_ID</label>
              <select 
                className="w-full bg-[#131314] border border-zinc-800/50 rounded-sm px-4 py-3 text-[11px] appearance-none focus:outline-none focus:border-zinc-700 transition-all cursor-pointer uppercase text-zinc-200"
                value={provider.id}
                onChange={(e) => {
                  const found = PROVIDERS.find(p => p.id === e.target.value);
                  if (found) setProvider(found);
                }}
              >
                {PROVIDERS.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">EXPIRY_DATE</label>
              <input 
                type="date"
                className="w-full bg-[#131314] border border-zinc-800/50 rounded-sm px-4 py-3 text-[11px] focus:outline-none focus:border-zinc-700 transition-all [color-scheme:dark] text-zinc-200"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">SECRET_VAL</label>
            <div className="relative">
              <input 
                required
                type={showValue ? 'text' : 'password'}
                placeholder="INPUT_SECRET_BUFFER"
                className="w-full bg-[#131314] border border-zinc-800/50 rounded-sm px-4 py-3 text-[11px] focus:outline-none focus:border-zinc-700 transition-all placeholder:text-zinc-800 pr-20 text-zinc-200"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
              <button 
                type="button"
                onClick={() => setShowValue(!showValue)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] font-bold text-zinc-600 hover:text-zinc-300 uppercase tracking-widest"
              >
                {showValue ? 'HIDE' : 'SHOW'}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">METADATA_NOTES</label>
            <textarea 
              placeholder="SYSTEM_METADATA_EXT..."
              rows={2}
              className="w-full bg-[#131314] border border-zinc-800/50 rounded-sm px-4 py-3 text-[11px] focus:outline-none focus:border-zinc-700 transition-all placeholder:text-zinc-800 resize-none uppercase text-zinc-200"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="pt-6 flex items-center justify-between border-t border-zinc-800/50">
            <div className="flex flex-col">
              <span className="text-[8px] font-bold text-zinc-700 uppercase tracking-widest">Encryption: AES_256_GCM</span>
              <span className="text-[8px] font-bold text-zinc-700 uppercase tracking-widest">Protocol: LIT_SESSION_V3</span>
            </div>
            <button 
              type="submit"
              disabled={isEncrypting || !name || !value}
              className="bg-indigo-700 hover:bg-indigo-600 disabled:bg-zinc-800 disabled:text-zinc-700 text-white text-[11px] font-bold px-10 py-3 rounded-sm transition-all uppercase tracking-[0.2em]"
            >
              {isEncrypting ? 'PROCESS...' : 'COMMIT_VAULT'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
