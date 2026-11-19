'use strict';

(function (root) {
  function redact(value) {
    return String(value ?? '')
      .replace(/\{[\s\S]*\}|\[\s*(?:["{\d-]|true\b|false\b|null\b)[\s\S]*\]/g, '[redacted body]')
      .replace(/\b(?:https?|file):\/\/[^\s<>"']+/gi, (url) => {
        try {
          const parsed = new URL(url);
          parsed.username = '';
          parsed.password = '';
          parsed.search = '';
          parsed.hash = '';
          return parsed.toString();
        } catch { return '[redacted URL]'; }
      })
      .replace(/(?:authorization|proxy-authorization|set-cookie|cookie)\s*[:=]\s*[^\r\n]+/gi, '[redacted header]')
      .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
      .replace(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted email]')
      .replace(/FAKE_KEYSHIELD_NOT_A_KEY::(?:Bearer\s+)?[^\s"'<>]+/g, '[redacted]')
      .replace(/\b(?:sk[-_]|ks_|ksv\d_|ksz\d\.)[A-Za-z0-9_+/.=-]+/g, '[redacted]')
      .replace(/\b(?:eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*|[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+)/g, '[redacted]')
      .replace(/[A-Za-z0-9_+/=-]{24,}/g, '[redacted]');
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { redact };
  else root.keyshieldRedaction = { redact };
})(typeof globalThis !== 'undefined' ? globalThis : this);
