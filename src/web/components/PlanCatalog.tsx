import React from 'react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

export type DeviceLevelId = 'personal' | 'companion' | 'runtime';

export interface PlanSpec {
  id: string;
  name: string;
  tier?: string;
  billing: string;
  monthly_usd: number;
  included_usd: number;
  devices: Record<DeviceLevelId, number>;
  features?: string[];
  feature_copy?: Record<string, string>;
  promise?: string;
  blurb: string;
}

export interface DeviceLevelCopy {
  id: DeviceLevelId;
  title: string;
  summary: string;
}

export interface PlanWhy {
  hybrid: string;
  subscription: string;
  payg: string;
  scope?: string;
}

export interface PlanSnapshot {
  plan: PlanSpec;
  used: Record<DeviceLevelId, number>;
  remaining: Record<DeviceLevelId, number>;
  why: PlanWhy;
  device_levels: DeviceLevelCopy[];
  features?: string[];
  allows?: Record<string, boolean>;
  credited_usd?: number;
}

const LEVEL_LABEL: Record<DeviceLevelId, string> = {
  personal: 'Personal',
  companion: 'Companion',
  runtime: 'Runtime',
};

const FEATURE_LABEL: Record<string, string> = {
  passkey_collect: 'Passkey auto-collection',
  vault_save: 'Save in vault',
  auto_plugin: 'Auto plugins',
  biometric_zk: 'Biometric ZK verify',
  accelerate: 'Acceleration',
  low_latency: 'Extreme low latency',
};

export const PlanCatalog: React.FC<{
  snapshot: PlanSnapshot | null;
  catalog: PlanSpec[];
  levels: DeviceLevelCopy[];
  why: PlanWhy | null;
  busy?: boolean;
  message?: string;
  ok?: boolean;
  onSelect: (planId: string) => void;
}> = ({ snapshot, catalog, levels, why, busy, message, ok, onSelect }) => {
  const current = snapshot?.plan.id;
  return (
    <div className="space-y-4">
      <Card title="Business scope" description="Free vault. Plugin + biometric ZK. Accelerate latency. PAYG for agent calls.">
        <div className="space-y-3 text-[13px] text-[#c5cce8] leading-relaxed">
          <p>{why?.scope ?? why?.hybrid}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-[#243365] bg-[#0e1631] p-3">
              <p className="text-[11px] uppercase tracking-wider text-white mb-1">Subscription</p>
              <p className="text-[12px] text-[#8a96c2]">{why?.subscription}</p>
            </div>
            <div className="rounded-lg border border-[#243365] bg-[#0e1631] p-3">
              <p className="text-[11px] uppercase tracking-wider text-white mb-1">Pay-as-you-go</p>
              <p className="text-[12px] text-[#8a96c2]">{why?.payg}</p>
            </div>
          </div>
        </div>
      </Card>

      <Card title="Three device levels" description="Not three copies of the same laptop — three different jobs.">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(levels.length ? levels : []).map((lvl) => {
            const used = snapshot?.used[lvl.id] ?? 0;
            const cap = snapshot?.plan.devices[lvl.id] ?? 0;
            const left = snapshot?.remaining[lvl.id] ?? 0;
            return (
              <div key={lvl.id} className="rounded-lg border border-[#243365] bg-[#0e1631] p-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[13px] text-white font-medium">{lvl.title}</span>
                  <Badge variant={left > 0 ? 'success' : cap === 0 ? 'neutral' : 'warning'}>
                    {used}/{cap}
                  </Badge>
                </div>
                <p className="text-[12px] text-[#8a96c2] leading-relaxed">{lvl.summary}</p>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {catalog.map((plan) => {
          const selected = plan.id === current;
          const feats = plan.features ?? [];
          return (
            <div
              key={plan.id}
              className={`rounded-xl border p-4 ${selected ? 'border-white bg-[#1a2548]' : 'border-[#243365] bg-[#131c39]'}`}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[15px] font-semibold text-white">{plan.name}</h3>
                {selected && <Badge variant="success">Current</Badge>}
              </div>
              <p className="text-[22px] text-white font-bold tabular-nums">
                {plan.monthly_usd === 0 ? 'Free' : `$${plan.monthly_usd.toFixed(0)}`}
                {plan.monthly_usd > 0 && <span className="text-[12px] font-medium text-[#8a96c2]"> / mo</span>}
              </p>
              <p className="text-[12px] text-[#c5cce8] mt-2 mb-3 leading-relaxed">{plan.promise ?? plan.blurb}</p>
              <ul className="text-[12px] text-[#c5cce8] space-y-1 mb-4">
                {feats.map((fid) => (
                  <li key={fid}>· {FEATURE_LABEL[fid] ?? fid}</li>
                ))}
                {(Object.keys(LEVEL_LABEL) as DeviceLevelId[]).map((k) => (
                  <li key={k}>
                    {LEVEL_LABEL[k]}: {plan.devices[k]}
                  </li>
                ))}
                <li>
                  Calls: {plan.included_usd > 0 ? `$${plan.included_usd.toFixed(0)} / mo then PAYG` : 'PAYG after free credit'}
                </li>
              </ul>
              <Button
                variant={selected ? 'secondary' : 'primary'}
                size="md"
                disabled={busy || selected}
                loading={busy && !selected}
                onClick={() => onSelect(plan.id)}
              >
                {selected ? 'Selected' : plan.monthly_usd === 0 ? 'Use Free' : `Switch to ${plan.name}`}
              </Button>
            </div>
          );
        })}
      </div>
      {message && (
        <p className={`text-[12px] ${ok ? 'text-emerald-400' : 'text-red-400'}`}>{message}</p>
      )}
    </div>
  );
};
