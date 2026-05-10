/**
 * AuditRetentionSettings — UI for configuring audit log retention policy.
 * Reads/writes policy via audit-retention.ts; shows current stats.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Trash2, Save, RefreshCw, Loader2 } from 'lucide-react';
import {
  getPolicy,
  setPolicy,
  purgeAuditLog,
  DEFAULT_POLICY,
  type AuditRetentionPolicy,
} from '@keyshield/shared/lib/audit-retention';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@keyshield/ui';

export const AuditRetentionSettings: React.FC = () => {
  const [policy, setLocalPolicy] = useState<AuditRetentionPolicy>(DEFAULT_POLICY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [purging, setPurging] = useState(false);
  const [saveResult, setSaveResult] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const p = getPolicy();
      setLocalPolicy(p);
    } catch (e) {
      console.error('Failed to load retention policy', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const handleSave = async () => {
    setSaving(true);
    try {
      setPolicy(policy);
      setSaveResult('Policy saved successfully');
      setTimeout(() => setSaveResult(null), 3000);
    } catch (e) {
      setSaveResult(e instanceof Error ? e.message : 'Failed to save');
    }
    setSaving(false);
  };

  const handlePurge = async () => {
    if (!confirm('Purge all audit log entries? This cannot be undone.')) return;
    setPurging(true);
    try {
      purgeAuditLog();
      setSaveResult('Audit log purged');
      setTimeout(() => setSaveResult(null), 3000);
    } catch (e) {
      setSaveResult(e instanceof Error ? e.message : 'Failed to purge');
    }
    setPurging(false);
  };

  if (loading) return <div style={{ color: '#505050', fontSize: 13 }}>Loading...</div>;

  return (
    <Card className="border-[#0f0f0f] shadow-sm bg-[#080808]">
      <CardHeader>
        <CardTitle style={{ color: '#707070' }}>Audit Retention</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium" style={{ color: '#707070' }}>Max Age</p>
            <p className="text-xs" style={{ color: '#505050' }}>Days to keep audit entries</p>
          </div>
          <input
            type="number"
            value={policy.max_age_days}
            onChange={e => setLocalPolicy({ ...policy, max_age_days: Number(e.target.value) })}
            min={1}
            max={365}
            className="w-20 bg-[#0a0a0a] border-[#141414] text-white rounded-lg px-3 py-2 text-sm"
            style={{ borderColor: '#141414', borderWidth: '1px' }}
          />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium" style={{ color: '#707070' }}>Max Entries</p>
            <p className="text-xs" style={{ color: '#505050' }}>Maximum number of log entries</p>
          </div>
          <input
            type="number"
            value={policy.max_entries}
            onChange={e => setLocalPolicy({ ...policy, max_entries: Number(e.target.value) })}
            min={100}
            max={100000}
            className="w-24 bg-[#0a0a0a] border-[#141414] text-white rounded-lg px-3 py-2 text-sm"
            style={{ borderColor: '#141414', borderWidth: '1px' }}
          />
        </div>
        <div className="flex gap-3 pt-4 border-t" style={{ borderTopColor: '#0f0f0f' }}>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Save size={14} className="mr-1.5" />}
            Save Policy
          </Button>
          <Button variant="destructive" size="sm" onClick={handlePurge} disabled={purging}>
            {purging ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Trash2 size={14} className="mr-1.5" />}
            Purge Log
          </Button>
          <Button variant="ghost" size="sm" onClick={reload}>
            <RefreshCw size={14} className="mr-1.5" />
            Reload
          </Button>
        </div>
        {saveResult && (
          <p className="text-sm" style={{ color: saveResult.startsWith('Failed') ? '#f87171' : '#34d399' }}>
            {saveResult}
          </p>
        )}
      </CardContent>
    </Card>
  );
};
