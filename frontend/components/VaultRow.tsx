
import React, { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, Copy, Trash2, MoreVertical, X, Check } from 'lucide-react';
import { VaultItem } from '../types';
import { getProviderIcon, getProviderColor } from './ProviderIcons';

interface Props {
  item: VaultItem;
  onDelete: (id: string) => void;
}

const decryptVault = async (value: string) => {
  return new Promise<string>((resolve) => {
    setTimeout(() => resolve(value), 400);
  });
};

const formatDate = (timestamp: number) => {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const maskKey = (key: string) => {
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 4)}${'•'.repeat(Math.min(key.length - 8, 20))}${key.slice(-4)}`;
};

export const VaultRow: React.FC<Props> = ({ item, onDelete }) => {
  const [isRevealed, setIsRevealed] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [revealedValue, setRevealedValue] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  
  const timerRef = useRef<number | null>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const REVEAL_DURATION = 30;

  const handleReveal = async () => {
    if (isRevealed) {
      clearReveal();
      return;
    }

    setIsDecrypting(true);
    try {
      const decrypted = await decryptVault(item.value);
      setRevealedValue(decrypted);
      setIsRevealed(true);
      setTimeLeft(REVEAL_DURATION);
      
      timerRef.current = window.setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearReveal();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } finally {
      setIsDecrypting(false);
    }
  };

  const clearReveal = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRevealed(false);
    setRevealedValue('');
    setTimeLeft(0);
  };

  const handleCopy = async () => {
    const textToCopy = isRevealed ? revealedValue : item.value;
    await navigator.clipboard.writeText(textToCopy);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(event.target as Node)) {
        setShowActions(false);
      }
    };

    if (showActions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showActions]);

  const ProviderIcon = getProviderIcon(item.domain || '');
  const providerColor = getProviderColor(item.domain || '');

  return (
    <>
      <tr className="group hover:bg-[#1e0a3c]/50 transition-all duration-200 border-b border-[#1e0a3c]/30">
        <td className="px-6 py-4">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${providerColor.bg} ${providerColor.border}`}>
              <ProviderIcon size={16} className={providerColor.text} />
            </div>
            <div>
              <div className="font-semibold text-[#ffd6f5]">{item.name}</div>
              {item.domain && (
                <div className="text-xs text-[#e0aaff]/60">{item.domain}</div>
              )}
            </div>
          </div>
        </td>

        <td className="px-6 py-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1e0a3c] border border-[#9d4edd]/20">
            <span className="text-xs font-medium" style={{ color: providerColor.badge }}>
              {item.domain?.split('.')[0].toUpperCase() || 'CUSTOM'}
            </span>
          </div>
        </td>

        <td className="px-6 py-4">
          <div className="flex items-center gap-3">
            <code className="text-sm font-mono text-[#e0aaff]/80">
              {isRevealed ? revealedValue : maskKey(item.value)}
            </code>
            <div className="flex items-center gap-2">
              <button
                onClick={handleReveal}
                disabled={isDecrypting}
                className={`p-1.5 rounded transition-all ${
                  isRevealed
                    ? 'text-[#ff2e63] hover:bg-[#ff2e63]/10'
                    : 'text-[#e0aaff]/60 hover:text-[#ff2e63] hover:bg-[#ff2e63]/10'
                }`}
                title={isRevealed ? 'Hide key' : 'Reveal key'}
              >
                {isRevealed ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
              <button
                onClick={handleCopy}
                className={`p-1.5 rounded transition-all ${
                  isCopied
                    ? 'text-[#00f5d4] hover:bg-[#00f5d4]/10'
                    : 'text-[#e0aaff]/60 hover:text-[#ff2e63] hover:bg-[#ff2e63]/10'
                }`}
                title={isCopied ? 'Copied!' : 'Copy key'}
              >
                {isCopied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
          </div>
        </td>

        <td className="px-6 py-4">
          <span className="text-sm text-[#e0aaff]/70">{formatDate(item.createdAt)}</span>
        </td>

        <td className="px-6 py-4">
          <div className="relative" ref={actionsRef}>
            <button
              onClick={() => setShowActions(!showActions)}
              className="p-2 text-[#e0aaff]/60 hover:text-[#ff2e63] hover:bg-[#ff2e63]/10 rounded transition-all"
            >
              <MoreVertical size={18} />
            </button>
            {showActions && (
              <div className="absolute right-0 mt-2 w-40 bg-[#1e0a3c] border border-[#9d4edd]/30 rounded-lg shadow-xl overflow-hidden z-10">
                <button
                  onClick={() => {
                    onDelete(item.id);
                    setShowActions(false);
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-left text-[#ff2e63] hover:bg-[#ff2e63]/10 transition-colors"
                >
                  <Trash2 size={16} />
                  <span className="text-sm">Delete</span>
                </button>
              </div>
            )}
          </div>
        </td>
      </tr>

      {/* Reveal Modal */}
      {isRevealed && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={clearReveal}
          />
          <div className="relative w-full max-w-2xl bg-gradient-to-br from-[#ff2e63] via-[#9d4edd] to-[#c77dff] rounded-2xl p-8 shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-bold text-white mb-1">{item.name}</h3>
                <p className="text-sm text-white/80">Auto-hiding in {timeLeft}s</p>
              </div>
              <button
                onClick={clearReveal}
                className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-all"
              >
                <X size={20} />
              </button>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-lg p-6 mb-4">
              <code className="text-lg font-mono text-white break-all">{revealedValue}</code>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleCopy}
                className="flex-1 px-4 py-3 bg-white/20 hover:bg-white/30 text-white rounded-lg font-medium transition-all flex items-center justify-center gap-2"
              >
                {isCopied ? (
                  <>
                    <Check size={18} />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy size={18} />
                    <span>Copy Key</span>
                  </>
                )}
              </button>
              <button
                onClick={clearReveal}
                className="px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg font-medium transition-all"
              >
                Close
              </button>
            </div>
            <div className="mt-4 h-1 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-white transition-all duration-1000 ease-linear"
                style={{ width: `${(timeLeft / REVEAL_DURATION) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};
