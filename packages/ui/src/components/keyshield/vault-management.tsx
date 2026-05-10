import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../../lib/utils';
import { Shield, Key, Lock, Activity, Wallet, Network, ChevronDown, MoreHorizontal, Eye, Copy, RefreshCw } from 'lucide-react';
import { Button } from './button';

interface VaultCardProps extends ComponentPropsWithoutRef<'div'> {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  headerActions?: React.ReactNode;
  footerActions?: React.ReactNode;
  children: React.ReactNode;
}

export function VaultCard({ title, subtitle, icon, headerActions, footerActions, children, className, ...props }: VaultCardProps) {
  return (
    <div className={cn('ks-card', className)} {...props}>
      <div className="ks-card-header">
        <div className="flex items-center gap-3">
          {icon}
          <div>
            <h3 className="text-sm font-semibold text-[hsl(240deg_6%_8%)]">{title}</h3>
            {subtitle && <p className="text-xs text-[hsl(240deg_4%_46%)] mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {headerActions}
      </div>
      <div className="ks-card-body">{children}</div>
      {footerActions && <div className="ks-card-footer">{footerActions}</div>}
    </div>
  );
}

interface AssetWidgetProps extends ComponentPropsWithoutRef<'div'> {
  label: string;
  value: string | number;
  change?: string;
  positive?: boolean;
  icon?: React.ReactNode;
}

export function AssetWidget({ label, value, change, positive, icon, className, ...props }: AssetWidgetProps) {
  return (
    <div className={cn('rounded-lg bg-white border border-[hsl(240deg_5%_89%)] shadow-sm p-5', className)} {...props}>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <span className="text-[10px] uppercase tracking-[0.2em] font-medium text-[hsl(240deg_4%_46%)]">{label}</span>
      </div>
      <div className="text-2xl font-semibold text-[hsl(240deg_6%_8%)] leading-tight">{value}</div>
      {change && <div className={cn('text-xs mt-2', positive ? 'text-[hsl(144deg_71%_27%)]' : 'text-[hsl(356deg_62%_56%)]')}>{change}</div>}
    </div>
  );
}

interface MultiSigControlProps extends ComponentPropsWithoutRef<'div'> {
  signed: number;
  required: number;
}

export function MultiSigControl({ signed, required, className, ...props }: MultiSigControlProps) {
  return (
    <div className={cn('inline-flex items-center gap-3', className)} {...props}>
      <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[hsl(240deg_6%_10%)] text-white text-sm font-mono tracking-wider">{signed}/{required} SIGS</span>
      <div className="flex gap-1">
        {Array.from({ length: required }).map((_, i) => (
          <div key={i} className={cn('w-2 h-2 rounded-full', i < signed ? 'bg-[hsl(240deg_6%_10%)]' : 'bg-[hsl(240deg_5%_89%)]')} />
        ))}
      </div>
    </div>
  );
}

export function DeployVaultButton(props: ComponentPropsWithoutRef<'button'>) {
  return <Button variant="primary" size="lg" className="gap-2" {...props}><Shield size={16} strokeWidth={1.5} />Deploy Vault</Button>;
}
export function ViewAnalyticsButton(props: ComponentPropsWithoutRef<'button'>) {
  return <Button variant="secondary" size="lg" className="gap-2" {...props}><Activity size={16} strokeWidth={1.5} />View Analytics</Button>;
}
export function AssignKeyButton(props: ComponentPropsWithoutRef<'button'>) {
  return <Button variant="outlined" size="lg" className="gap-2" {...props}><Key size={16} strokeWidth={1.5} />Assign Key</Button>;
}
export function SecureAccountButton(props: ComponentPropsWithoutRef<'button'>) {
  return <Button variant="primary" className="gap-2" {...props}><Lock size={14} strokeWidth={1.5} />Secure Account</Button>;
}
export function ApproveTxButton(props: ComponentPropsWithoutRef<'button'>) {
  return <Button variant="primary" className="gap-2" {...props}><Shield size={14} strokeWidth={1.5} />Approve Transaction</Button>;
}
export function NetworkControls(props: ComponentPropsWithoutRef<'div'>) {
  return (
    <div className={cn('inline-flex items-center gap-2', props.className)} {...props}>
      <Button variant="ghost" size="sm" className="gap-1.5 px-3 py-1.5"><Network size={14} />Mainnet<ChevronDown size={12} className="ml-0.5" /></Button>
      <Button variant="ghost" size="sm" className="gap-1.5 px-3 py-1.5"><RefreshCw size={14} />Sync</Button>
    </div>
  );
}

export function WalletAddressField({ address }: { address: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[hsl(240deg_5%_96%)] border border-[hsl(240deg_5%_89%)]">
      <Wallet size={14} className="text-[hsl(240deg_4%_46%)]" />
      <span className="font-mono text-sm tracking-wide text-[hsl(240deg_6%_8%)]">{address}</span>
      <Copy size={12} className="ml-auto text-[hsl(240deg_4%_46%)] cursor-pointer" />
    </div>
  );
}

export function PortfolioChart({ className, ...props }: ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg viewBox="0 0 120 120" className={cn('w-24 h-24', className)} {...props}>
      <circle cx="60" cy="60" r="52" fill="none" stroke="#eeeff1" strokeWidth="8" />
      <circle cx="60" cy="60" r="52" fill="none" stroke="#111113" strokeWidth="8" strokeDasharray="200 327" strokeDashoffset="-50" strokeLinecap="round" />
      <text x="60" y="64" textAnchor="middle" className="fill-[hsl(240deg_6%_8%)] font-semibold text-[14px]">61%</text>
    </svg>
  );
}
