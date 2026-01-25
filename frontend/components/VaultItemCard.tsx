
import React, { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, Key, Copy, Trash2 } from 'lucide-react';
import { VaultItem } from '../types';

interface Props {
  item: VaultItem;
  onDelete: (id: string) => void;
}

const decryptVault = async (value: string) => {
  return new Promise<string>((resolve) => {
    setTimeout(() => resolve(value), 400);
  });
};

export const VaultItemCard: React.FC<Props> = ({ item, onDelete }) => {
  const [isRevealed, setIsRevealed] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [revealedValue, setRevealedValue] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(item.name);
  const [timeLeft, setTimeLeft] = useState(0);
  
  const timerRef = useRef<number | null>(null);
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

  const handleCopy = () => {
    navigator.clipboard.writeText(item.value);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const saveName = () => {
    item.name = editedName || "UNNAMED";
    setIsEditing(false);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return (
    <div className="group relative transition-all duration-300">
      {isRevealed && (
        <div 
          className="absolute -top-3 left-0 h-[1.5px] bg-orange-600/30 transition-all duration-1000 ease-linear rounded-full"
          style={{ width: `${(timeLeft / REVEAL_DURATION) * 100}%` }}
        />
      )}

      <div className="flex items-start justify-between mb-4">
        <div className="flex flex-col flex-1 min-w-0 pr-4">
          {isEditing ? (
            <input 
              autoFocus
              className="bg-transparent border-b border-zinc-800 text-[13px] font-bold outline-none text-zinc-100 uppercase tracking-tight py-1 w-full"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => e.key === 'Enter' && saveName()}
            />
          ) : (
            <div className="flex items-center gap-2">
              <Key size={12} className="text-zinc-800 shrink-0" />
              <h3 
                onClick={() => setIsEditing(true)}
                className="text-[13px] font-bold text-zinc-300 uppercase tracking-tight cursor-pointer truncate hover:text-white transition-colors"
              >
                {item.name || "UNNAMED"}
              </h3>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 opacity-0 group-hover:opacity-100 transition-all">
          <button 
            onClick={handleCopy}
            className={`transition-colors ${isCopied ? 'text-orange-500' : 'text-zinc-800 hover:text-zinc-500'}`}
            title="Copy"
          >
            <Copy size={13} />
          </button>
          <button 
            onClick={() => onDelete(item.id)}
            className="text-zinc-800 hover:text-red-900 transition-colors"
            title="Delete"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-6 py-1">
        <code className={`text-[11px] font-mono truncate flex-1 ${isRevealed ? 'text-zinc-400' : 'text-zinc-900'}`}>
          {isDecrypting ? '...' : isRevealed ? (revealedValue.length > 12 ? revealedValue.substring(0, 12) + '...' : revealedValue) : '••••••••'}
        </code>
        
        <button 
          onClick={handleReveal}
          disabled={isDecrypting}
          className={`transition-all ${isRevealed ? 'text-orange-600' : 'text-zinc-900 hover:text-zinc-600'}`}
        >
          {isRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between opacity-30">
        <div className="flex gap-4">
          {item.tags.slice(0, 1).map(tag => (
            <span key={tag} className="text-[8px] font-bold uppercase tracking-widest">#{tag}</span>
          ))}
        </div>
        <span className="text-[8px] font-bold uppercase">{timeLeft > 0 ? `${timeLeft}S` : ''}</span>
      </div>
    </div>
  );
};
