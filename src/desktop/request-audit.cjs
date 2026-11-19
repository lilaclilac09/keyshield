'use strict';

const fs = require('node:fs');
const { redact } = require('./redaction.js');

function requestShape(details) {
  const url = new URL(details.url);
  let body = '';
  for (const part of details.uploadData || []) {
    if (part.bytes) body += Buffer.from(part.bytes).toString('utf8');
  }
  let parsed;
  try { parsed = JSON.parse(body); } catch { parsed = null; }
  let plaintextFieldPresent = false;
  let hasCiphertextEnvelope = false;
  const visit = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    if ((typeof obj.cipher === 'string' || typeof obj.ciphertext === 'string') && typeof obj.iv === 'string') hasCiphertextEnvelope = true;
    for (const [key, value] of Object.entries(obj)) {
      if (/^(api[_-]?key|raw[_-]?key|value|secret|plaintext|password)$/i.test(key)) plaintextFieldPresent = true;
      visit(value);
    }
  };
  visit(parsed);
  return {
    method: /^[A-Z]+$/.test(details.method) ? details.method : 'UNKNOWN',
    route: redact(url.pathname),
    bodyFieldNames: parsed && !Array.isArray(parsed) && typeof parsed === 'object' ? Object.keys(parsed).map(redact).sort() : [],
    hasCiphertextEnvelope,
    plaintextFieldPresent,
    syntheticMarkerPresent: body.includes('FAKE'),
  };
}

function installRequestAudit(ses, file) {
  if (!file) return false;
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    try {
      fs.appendFileSync(file, `${JSON.stringify(requestShape(details))}\n`, { mode: 0o600 });
    } catch { /* Observability must not change the request outcome. */ }
    callback({ cancel: false });
  });
  return true;
}

module.exports = { requestShape, installRequestAudit };
