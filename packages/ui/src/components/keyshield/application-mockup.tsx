import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../../lib/utils';
import { Shield, Key, CreditCard, Smartphone, Fingerprint } from 'lucide-react';

export function TitaniumAccessCard(props: ComponentPropsWithoutRef<'div'>) {
  return (
    <div className={cn('mt-mockup-card flex flex-col items-center justify-between p-6', props.className)} {...props}>
      <div className="flex items-center gap-2"><Shield size={14} className="text-white/60" /><span className="text-[8px] tracking-[0.3em] uppercase font-medium text-white/50">KEYSHIELD</span></div>
      <div className="flex flex-col items-center gap-2"><Key size={32} className="text-white/40" /><span className="text-[7px] tracking-widest uppercase text-white/30">TITANIUM</span></div>
      <div className="flex items-center gap-1.5"><CreditCard size={12} className="text-white/40" /><span className="font-mono text-[7px] tracking-wider text-white/30">•••• •••• •••• 4291</span></div>
    </div>
  );
}

export function HardwareKey(props: ComponentPropsWithoutRef<'div'>) {
  return (
    <div className={cn('mt-mockup-device flex flex-col items-center justify-between p-5 py-6', props.className)}>
      <div className="flex items-center gap-1.5"><Shield size={14} className="text-white/50" /><span className="text-[7px] tracking-[0.3em] uppercase font-medium text-white/40">KS</span></div>
      <Key size={40} className="text-white/25" strokeWidth={1} />
      <div className="flex flex-col items-center gap-1"><Fingerprint size={16} className="text-white/30" /><span className="font-mono text-[7px] tracking-wider text-white/40">KS-29XA</span></div>
    </div>
  );
}

export function TabletDashboard(props: ComponentPropsWithoutRef<'div'>) {
  return (
    <div className={cn('mt-mockup-card w-[240px] h-[160px] rounded-xl p-5', props.className)}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[7px] tracking-widest uppercase font-medium text-white/40">KEYSHIELD</span>
        <div className="flex gap-1"><Shield size={8} className="text-green-400/60" /><div className="w-[20px] h-[3px] bg-white/20 rounded-full" /></div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between"><span className="text-[8px] tracking-wider text-white/30 uppercase">Vault Status</span><span className="text-[9px] font-medium text-white">ACTIVE</span></div>
        <div className="w-full h-px bg-white/10" />
        <div className="flex justify-between items-center">
          {['Keys', 'Agents', 'Sigs'].map((label) => (
            <div key={label} className="flex flex-col items-center gap-1"><span className="text-[8px] text-white/40">{Math.floor(Math.random() * 90 + 10)}</span><span className="text-[6px] tracking-wider uppercase text-white/25">{label}</span></div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function NfcDevice(props: ComponentPropsWithoutRef<'div'>) {
  return (
    <div className={cn('mt-mockup-card w-[140px] h-[140px] rounded-full flex flex-col items-center justify-center', props.className)}>
      <div className="w-16 h-16 rounded-full border border-white/20 flex items-center justify-center mb-3"><Smartphone size={24} className="text-white/40" /></div>
      <span className="text-[7px] tracking-widest uppercase text-white/30">NFC</span>
    </div>
  );
}

export function AuthFob(props: ComponentPropsWithoutRef<'div'>) {
  return (
    <div className={cn('mt-mockup-card w-[120px] h-[160px] rounded-2xl flex flex-col items-center justify-center', props.className)}>
      <div className="w-3 h-3 rounded-full border border-white/30 mb-4" />
      <Shield size={28} className="text-white/35 mb-4" strokeWidth={1.2} />
      <span className="text-[7px] tracking-widest uppercase text-white/30">AUTH</span>
    </div>
  );
}

export function ApplicationMockupGrid(props: ComponentPropsWithoutRef<'div'>) {
  return (
    <div className={cn('mt-square-grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-6', props.className)}>
      <TitaniumAccessCard /><HardwareKey /><TabletDashboard /><NfcDevice /><AuthFob />
    </div>
  );
}
