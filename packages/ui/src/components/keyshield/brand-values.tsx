import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../../lib/utils';
import { Shield, Key, Lock, Globe, Zap, Eye, Server, CreditCard, Layers, Briefcase, CheckCircle, Settings, AlertTriangle, Activity, Database, Cpu } from 'lucide-react';

interface BrandValueProps {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
}

const values: BrandValueProps[] = [
  { icon: Shield, label: 'Security' },
  { icon: Lock, label: 'Trust' },
  { icon: Server, label: 'Compliance' },
  { icon: CheckCircle, label: 'Integrity' },
  { icon: Eye, label: 'Transparency' },
  { icon: Settings, label: 'Governance' },
  { icon: Key, label: 'Access' },
  { icon: Zap, label: 'Innovation' },
  { icon: Activity, label: 'Reliability' },
  { icon: Globe, label: 'Sovereignty' },
  { icon: Database, label: 'Verification' },
  { icon: Cpu, label: 'Infrastructure' },
];

function BrandValue({ icon: Icon, label }: BrandValueProps) {
  return (
    <div className="mt-brand-value">
      <div className="mt-brand-icon">
        <Icon size={18} className="text-[hsl(240deg_4%_46%)]" />
      </div>
      <span className="text-[9px] uppercase tracking-[0.25em] font-medium text-[hsl(240deg_4%_46%)]">{label}</span>
    </div>
  );
}

export function BrandValuesGrid(props: ComponentPropsWithoutRef<'div'>) {
  return (
    <div className={cn('mt-square-grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2', props.className)}>
      {values.map((v) => <BrandValue key={v.label} icon={v.icon} label={v.label} />)}
    </div>
  );
}
