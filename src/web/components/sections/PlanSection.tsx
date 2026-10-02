import React, { useCallback, useEffect, useState } from 'react';
import { Card, StatCard } from '../ui/Card';
import { Button } from '../ui/Button';
import { apiFetch } from '../../lib/auth';

interface Plan {
  id: string;
  name: string;
  monthly_usd: number;
  included_calls: number;
  agents: number | null;
  recommended: boolean;
  includes: string[];
  selected?: boolean;
}

interface UpstreamShare {
  upstream: string;
  calls: number;
  share_pct: number;
}

interface Breakdown {
  plan: Plan;
  period: string;
  allowance: {
    used_calls: number;
    included_calls: number;
    remaining_calls: number;
    used_pct: number;
    covered: boolean;
  };
  by_upstream: UpstreamShare[];
  own_keys: { calls: number; headline: string };
  settlement: {
    monthly_usd: number;
    headline: string;
    calls_inside_plan: number;
    calls_outside_plan: number;
    covers_with: string | null;
  };
  plans: Plan[];
}

const fmtCalls = (n: number) => n.toLocaleString('en-US');

export const PlanSection: React.FC = () => {
  const [data, setData] = useState<Breakdown | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setError('');
    try {
      const res = await apiFetch('/billing/breakdown');
      if (!res.ok) {
        setError('The plan breakdown is unavailable.');
        return;
      }
      setData(await res.json());
    } catch {
      setError('The plan breakdown is unavailable.');
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const choose = async (planId: string) => {
    setBusy(planId);
    setError('');
    try {
      const res = await apiFetch('/billing/subscription', {
        method: 'POST',
        body: JSON.stringify({ plan: planId }),
      });
      if (!res.ok) {
        setError('That plan could not be selected.');
        return;
      }
      await refresh();
    } catch {
      setError('That plan could not be selected.');
    } finally {
      setBusy(null);
    }
  };

  const plans = data?.plans ?? [];
  const usedPct = data ? Math.min(100, data.allowance.used_pct) : 0;

  return (
    <div className="space-y-6">
      <Card
        title="One monthly plan"
        description="You choose a plan. Calls inside it are included. Your own API keys are never metered."
      >
        <p className="text-[15px] text-white">{data?.settlement.headline ?? 'Loading this month…'}</p>
        {data && (
          <p className="text-[12px] text-[#8a96c2] mt-2">
            {data.period} · {fmtCalls(data.allowance.remaining_calls)} platform calls still included
          </p>
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plans.map(plan => {
          const current = data?.plan.id === plan.id;
          return (
            <div
              key={plan.id}
              className={`rounded-xl bg-[#131c39] p-5 flex flex-col ${plan.recommended ? 'border border-white' : 'border border-[#243365]/50'}`}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-[13px] font-bold uppercase tracking-wider">{plan.name}</h3>
                {plan.recommended && <span className="text-[10px] uppercase tracking-wider text-black bg-white rounded-full px-2 py-0.5">Most teams</span>}
              </div>
              <div className="mt-3 text-[28px] font-semibold tracking-tight">${plan.monthly_usd}<span className="text-[12px] text-[#8a96c2] font-medium"> / month</span></div>
              <p className="text-[12px] text-[#a8b3d8] mt-1">{fmtCalls(plan.included_calls)} platform calls included</p>
              <ul className="mt-4 space-y-1.5 text-[12px] text-[#c5cceb] flex-1">
                {plan.includes.map(line => <li key={line}>{line}</li>)}
              </ul>
              <Button
                className="mt-4"
                variant={current ? 'primary' : 'secondary'}
                fullWidth
                loading={busy === plan.id}
                onClick={() => choose(plan.id)}
              >
                {current ? (data?.plan.selected ? 'Current plan' : 'Start here') : `Use ${plan.name}`}
              </Button>
            </div>
          );
        })}
      </div>

      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard label="Included this month" value={fmtCalls(data.allowance.included_calls)} hint={data.plan.name} />
            <StatCard label="Platform calls" value={fmtCalls(data.allowance.used_calls)} hint={`${usedPct}% of the plan`} trend={data.allowance.covered ? 'up' : 'down'} />
            <StatCard label="Your own keys" value={fmtCalls(data.own_keys.calls)} hint="Not part of the plan" />
          </div>

          <Card title="Where this month went" description="Share of platform calls. The plan price is the settlement.">
            <div className="h-2 rounded-full bg-[#0e1631] overflow-hidden mb-4">
              <div className="h-full bg-white" style={{ width: `${usedPct}%` }} />
            </div>
            {data.by_upstream.length === 0 ? (
              <p className="text-[12px] text-[#8a96c2]">No platform calls yet this month.</p>
            ) : (
              <ul className="space-y-3">
                {data.by_upstream.map(row => (
                  <li key={row.upstream}>
                    <div className="flex justify-between text-[12px] mb-1">
                      <span className="text-white">{row.upstream}</span>
                      <span className="text-[#8a96c2]">{fmtCalls(row.calls)} · {row.share_pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[#0e1631] overflow-hidden">
                      <div className="h-full bg-[#a8b3d8]" style={{ width: `${Math.min(100, row.share_pct)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[11px] text-[#5e6a91] mt-4">{data.own_keys.headline}. {fmtCalls(data.own_keys.calls)} calls.</p>
          </Card>
        </>
      )}

      {error && <p className="text-[12px] text-red-400">{error}</p>}
    </div>
  );
};
