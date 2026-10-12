import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Card } from './ui/Card';
import { CodeBlock } from './ui/CodeBlock';
import { Badge } from './ui/Badge';
import {
  DETECT_AFTER_PATCH,
  FIND_LOCAL_PATH_PY,
  LEFTOVER_121_CASE,
  LOCAL_PULL_BRIDGE_SH,
  OFFLINE_BRIDGE_STAMP_PY,
  OFFLINE_PATCH_PY,
} from '../lib/ext-trouble';

/** Leftover 1.2.4 + session-bridge stamp trunks. Lives on Home only. */
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
          1. Local stamp — paste this only. Do not use eval.
        </p>
        <p className="text-[11px] text-[#8a96c2] mb-2 leading-relaxed">
          zsh parse error near <code className="text-white">)</code> means you wrapped python in{' '}
          <code className="text-white">eval "$(…)"</code>, or pasted a comment like{' '}
          <code className="text-white">1) find … (Chrome …)</code>. Paste only the block below.
          Terminal must print <code className="text-white">ver 1.2.4</code> and{' '}
          <code className="text-white">session-bridge True</code>. This also rewrites{' '}
          <code className="text-white">popup.html</code> to three lines: Sign in, Allow detect,
          then after login <code className="text-white">N saved</code> + keys. No Settings / token box.
        </p>
        <CodeBlock code={LOCAL_PULL_BRIDGE_SH} />
      </div>

      <details open>
        <summary className="text-[12px] font-semibold text-white cursor-pointer">
          Find path only. python3 heredoc. Do not eval.
        </summary>
        <div className="mt-2">
          <CodeBlock code={`python3 - <<'PY'\n${FIND_LOCAL_PATH_PY.trimEnd()}\nPY\n`} />
        </div>
      </details>

      <details open>
        <summary className="text-[12px] font-semibold text-white cursor-pointer">
          Optional git fetch. Skip if github.com DNS fails.
        </summary>
        <div className="mt-2">
          <CodeBlock
            code={`git fetch origin cursor/cursor-api-autofill-b48a || echo skip-git
git checkout cursor/cursor-api-autofill-b48a || echo skip-git
git pull origin cursor/cursor-api-autofill-b48a || echo skip-git
`}
          />
        </div>
      </details>

      <details open>
        <summary className="text-[12px] font-semibold text-white cursor-pointer">
          3. Pull failed — session-bridge stamp only (python, not HTML)
        </summary>
        <div className="mt-2">
          <CodeBlock code={`python3 - <<'PY'\n${OFFLINE_BRIDGE_STAMP_PY.trimEnd()}\nPY\n`} />
        </div>
      </details>

      <details open>
        <summary className="text-[12px] font-semibold text-white cursor-pointer">
          4. Full signed-pane fallback (python, do not paste as HTML)
        </summary>
        <div className="mt-2">
          <CodeBlock code={`python3 - <<'PY'\n${OFFLINE_PATCH_PY.trimEnd()}\nPY\n`} />
        </div>
      </details>

      <div>
        <p className="text-[12px] font-semibold text-white mb-2">Then detect</p>
        <ol className="space-y-1.5 list-decimal list-inside text-[12px] text-[#e8ecff]">
          {DETECT_AFTER_PATCH.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
    </div>
  </Card>
);
