import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Card } from './ui/Card';
import { CodeBlock } from './ui/CodeBlock';
import { Badge } from './ui/Badge';
import {
  DEVICE_SAVE_CHECKLIST,
  FIND_LOCAL_PATH_PY,
  LEFTOVER_121_CASE,
} from '../lib/ext-trouble';

/** Local extension diagnostics in Docs & Troubleshooting. */
export const ExtTroubleCase: React.FC = () => (
  <Card variant="bordered" className="border-amber-900/50">
    <div id="ext-trouble-leftover-121" data-testid="ext-trouble-leftover-121" className="space-y-4">
      <div className="flex items-start gap-2">
        <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="warning">Leftover</Badge>
            <span className="text-[13px] font-semibold text-white uppercase tracking-wider">
              {LEFTOVER_121_CASE.title}
            </span>
          </div>
        </div>
      </div>

      <p className="text-[13px] text-[#e8ecff] leading-relaxed" data-testid="ext-trouble-symptom">
        {LEFTOVER_121_CASE.symptom}
      </p>

      <div>
        <p className="text-[12px] font-semibold text-white mb-1">
          Save credentials explicitly in your device vault
        </p>
        <p className="text-[11px] text-[#8a96c2] mb-2 leading-relaxed">
          Automatic repair scripts are no longer offered. Enter each individual credential
          yourself in the dashboard Vault. The diagnostic below only locates your local extension folder.
        </p>
      </div>

      <details open>
        <summary className="text-[12px] font-semibold text-white cursor-pointer">
          Find path only. python3 heredoc. Do not eval.
        </summary>
        <div className="mt-2">
          <CodeBlock code={`python3 - <<'PY'\n${FIND_LOCAL_PATH_PY.trimEnd()}\nPY\n`} />
        </div>
      </details>

      <div>
        <p className="text-[12px] font-semibold text-white mb-2">Device-only save checklist</p>
        <ol className="space-y-1.5 list-decimal list-inside text-[12px] text-[#e8ecff]">
          {DEVICE_SAVE_CHECKLIST.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
    </div>
  </Card>
);
