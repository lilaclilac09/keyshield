'use strict';

/**
 * Launch diagnostics for the desktop shell.
 *
 * Until now a launch that ended in a blank window left no trace anywhere:
 * no log file existed in the repo or on the machine, and the main process
 * had no record of renderer console errors. This module gives every launch
 * a plain-text log file and keeps the most recent renderer errors in
 * memory, so the diagnostics screen can say what actually went wrong.
 *
 * Logging must never break launch: every write is guarded, and a logging
 * failure is silently swallowed.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { redact } = require('./redaction.js');

function defaultLogPath() {
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Logs', 'KeyShield', 'keyshield-desktop.log');
  }
  return path.join(os.tmpdir(), 'keyshield-desktop.log');
}

function logFilePath(customPath) {
  return customPath || process.env.KS_DESKTOP_LOG || defaultLogPath();
}

function appendLog(logPath, line) {
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `${new Date().toISOString()} ${redact(line)}\n`, { mode: 0o600 });
  } catch {
    // Logging must never break launch.
  }
}

function createDiagnostics(customLogPath) {
  const file = logFilePath(customLogPath);
  const errors = [];
  return {
    logPath: file,
    log(line) {
      appendLog(file, String(line));
    },
    recordRendererError(message, source) {
      const entry = {
        at: new Date().toISOString(),
        message: redact(message),
        source: redact(source),
      };
      errors.push(entry);
      if (errors.length > 50) errors.shift();
      appendLog(file, `renderer-error${entry.source ? ` [${entry.source}]` : ''} ${entry.message}`);
    },
    recentErrors() {
      return errors.map((entry) => ({ ...entry, message: redact(entry.message), source: redact(entry.source) }));
    },
    summary() {
      const lines = [
        `KeyShield desktop diagnostics — ${new Date().toISOString()}`,
        `log: ${file}`,
      ];
      if (errors.length === 0) {
        lines.push('no renderer errors captured');
      } else {
        for (const entry of errors.slice(-10)) {
          lines.push(`- ${entry.at}${entry.source ? ` [${entry.source}]` : ''} ${entry.message}`);
        }
      }
      return redact(lines.join('\n'));
    },
  };
}

module.exports = {
  defaultLogPath,
  logFilePath,
  appendLog,
  createDiagnostics,
};
