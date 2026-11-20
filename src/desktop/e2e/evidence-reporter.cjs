'use strict';

const fs = require('node:fs');
const { redact } = require('../redaction.js');

function safeLine(value) {
  return redact(value).replace(/FAKE/g, 'synthetic').replace(/[\r\n]+/g, ' ');
}

class EvidenceReporter {
  constructor() {
    this.file = process.env.KS_E2E_EVIDENCE;
    this.target = process.env.KS_E2E_APP ? 'installed' : 'source';
    this.counts = { passed: 0, failed: 0, skipped: 0 };
  }
  write(line) {
    if (this.file) fs.appendFileSync(this.file, `${safeLine(line)}\n`, { mode: 0o600 });
  }
  onTestEnd(test, result) {
    const status = result.status === 'passed' || result.status === 'skipped' ? result.status : 'failed';
    this.counts[status]++;
    const reasons = test.annotations.filter((annotation) => annotation.type === 'skip').map((annotation) => annotation.description || '');
    this.write(`${this.target} | ${test.title} | ${status}${reasons.length ? ` | ${reasons.join('; ')}` : ''}`);
  }
  onEnd() {
    this.write(`${this.target} totals | passed=${this.counts.passed} failed=${this.counts.failed} skipped=${this.counts.skipped}`);
  }
}

module.exports = EvidenceReporter;
