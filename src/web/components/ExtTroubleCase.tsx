import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Card } from './ui/Card';
import { CodeBlock } from './ui/CodeBlock';
import { Badge } from './ui/Badge';
import {
  DETECT_AFTER_PATCH,
  FIND_LOCAL_PATH_PY,
  LEFTOVER_121_CASE,
  OFFLINE_PATCH_PY,
  TRY_PULL_THEN_PATCH_SH,
} from '../lib/ext-trouble';

interface Props {
  variant?: 'home' | 'docs';
}

export const ExtTroubleCase: React.FC<Props> = ({ variant = 'docs' }) => {
  const home = variant === 'home';
  return (
    <Card variant="bordered" className="border-amber-900/50">
      <div id="ext-trouble-leftover-121" data-testid="ext-trouble-leftover-121" className="space-y-4">
        <div className="flex items-start gap-2">
          <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="warning">Trouble</Badge>
              <span className="text-[13px] font-semibold text-white uppercase tracking-wider">
                {LEFTOVER_121_CASE.title}
              </span>
            </div>
            <p className="text-[12px] text-[#a8b3d8] mt-1">{LEFTOVER_121_CASE.titleZh}</p>
          </div>
        </div>

        <p className="text-[13px] text-[#e8ecff] leading-relaxed" data-testid="ext-trouble-symptom">
          {LEFTOVER_121_CASE.symptom}
        </p>
        <p className="text-[12px] text-[#8a96c2] leading-relaxed">{LEFTOVER_121_CASE.symptomZh}</p>

        <div>
          <p className="text-[12px] font-semibold text-white mb-1">
            1. Find the local path · 先找本机路径（Chrome internals，不是写死 Downloads）
          </p>
          <p className="text-[11px] text-[#8a96c2] mb-2 leading-relaxed">
            Reads Chrome / Edge / Brave / Arc <code className="text-[#a8b3d8]">Preferences</code> unpacked
            <code className="text-[#a8b3d8]"> path</code> (Details → Loaded from), then walks Downloads /
            Documents / Desktop / src / dev. Do not assume{' '}
            <code className="text-[#a8b3d8]">~/Downloads/privacy_hack/keyshield</code>.
          </p>
          <CodeBlock code={FIND_LOCAL_PATH_PY} />
        </div>

        <div>
          <p className="text-[12px] font-semibold text-white mb-1">
            2. Try pull · github.com 解析失败就跳过，直接跑 python3
          </p>
          <p className="text-[11px] text-[#8a96c2] mb-2 leading-relaxed">
            Paste the whole block into zsh. Terminal must print <code className="text-white">ver 1.2.4</code>,{' '}
            <code className="text-white">signed-pane True</code>, and{' '}
            <code className="text-white">session-bridge True</code>.
          </p>
          <CodeBlock code={TRY_PULL_THEN_PATCH_SH} />
        </div>

        <details open={!home}>
          <summary className="text-[12px] font-semibold text-white cursor-pointer">
            3. Pull failed — paste this python3 only（这是 python，不是 HTML）
          </summary>
          <div className="mt-2">
            <CodeBlock code={`python3 - <<'PY'\n${OFFLINE_PATCH_PY.trimEnd()}\nPY\n`} />
          </div>
        </details>

        <div>
          <p className="text-[12px] font-semibold text-white mb-2">Then detect · 立刻检测</p>
          <ol className="space-y-1.5 list-decimal list-inside text-[12px] text-[#e8ecff]">
            {DETECT_AFTER_PATCH.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      </div>
    </Card>
  );
};
