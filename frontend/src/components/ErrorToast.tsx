'use client';

import { useEffect, useState } from 'react';
import { X, AlertCircle, CheckCircle, Info, XCircle } from 'lucide-react';

export type ToastType = 'error' | 'success' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ErrorToastProps {
  toast: Toast | null;
  onClose: () => void;
}

export function ErrorToast({ toast, onClose }: ErrorToastProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (toast) {
      setIsVisible(true);
      const duration = toast.duration || 5000;
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(onClose, 300); // Wait for fade out
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [toast, onClose]);

  if (!toast) return null;

  const getIcon = () => {
    switch (toast.type) {
      case 'error':
        return <XCircle className="w-5 h-5 text-red-400" />;
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-yellow-400" />;
      case 'info':
        return <Info className="w-5 h-5 text-blue-400" />;
    }
  };

  const getBgColor = () => {
    switch (toast.type) {
      case 'error':
        return 'bg-red-900/20 border-red-500/50';
      case 'success':
        return 'bg-green-900/20 border-green-500/50';
      case 'warning':
        return 'bg-yellow-900/20 border-yellow-500/50';
      case 'info':
        return 'bg-blue-900/20 border-blue-500/50';
    }
  };

  return (
    <div
      className={`fixed top-4 right-4 z-50 transition-all duration-300 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
      }`}
    >
      <div
        className={`${getBgColor()} border rounded-lg p-4 shadow-2xl backdrop-blur-xl min-w-[300px] max-w-[500px] cyber-glow`}
      >
        <div className="flex items-start gap-3">
          {getIcon()}
          <div className="flex-1">
            <p className="text-sm text-white font-medium">{toast.message}</p>
          </div>
          <button
            onClick={() => {
              setIsVisible(false);
              setTimeout(onClose, 300);
            }}
            className="text-white/40 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// Toast context/hook for global error display
let toastListeners: Array<(toast: Toast | null) => void> = [];
let currentToast: Toast | null = null;

export function showToast(message: string, type: ToastType = 'error', duration?: number) {
  const toast: Toast = {
    id: Date.now().toString(),
    message,
    type,
    duration,
  };
  currentToast = toast;
  toastListeners.forEach((listener) => listener(toast));
}

export function useToast() {
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    toastListeners.push(setToast);
    return () => {
      toastListeners = toastListeners.filter((l) => l !== setToast);
    };
  }, []);

  const closeToast = () => {
    setToast(null);
    currentToast = null;
  };

  return { toast, closeToast };
}
