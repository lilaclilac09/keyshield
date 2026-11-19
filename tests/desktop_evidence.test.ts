import { expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const EvidenceReporter = require('../src/desktop/e2e/evidence-reporter.cjs');

it('writes per-case results and skip reasons without credential values', () => {
  const root = mkdtempSync(join(tmpdir(), 'desktop-evidence-'));
  try {
    const reporter = new EvidenceReporter();
    reporter.file = join(root, 'evidence.txt');
    reporter.onTestEnd({ title: 'KS-SEC-002 FAKE sk-proj-abcdefghijklmnopqrstuv', annotations: [] }, { status: 'passed' });
    reporter.onTestEnd({ title: 'KS-USE-001 Save + Call', annotations: [{ type: 'skip', description: 'No external provider calls' }] }, { status: 'skipped' });
    reporter.onEnd();
    const output = readFileSync(reporter.file, 'utf8');
    expect(output).toContain('KS-SEC-002');
    expect(output).toContain('passed=1 failed=0 skipped=1');
    expect(output).toContain('No external provider calls');
    expect(output).not.toMatch(/FAKE|ks_|sk-|eyJ/);
    reporter.file = undefined;
    expect(() => reporter.onEnd()).not.toThrow();
  } finally { rmSync(root, { recursive: true, force: true }); }
});
