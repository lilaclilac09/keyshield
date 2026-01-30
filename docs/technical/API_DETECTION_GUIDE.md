# API Key Detection Guide

**API Key vs Password Detection — Differences and Implementation**

This guide explains how API key auto-detection and auto-fill differ from password scenarios (e.g. Bitwarden) and provides code examples for KeyShield.

---

## 1. Detection Context Differences

| Aspect | Passwords | API Keys |
|--------|-----------|----------|
| **Location** | Form fields (`input[type="password"]`) on login pages | Headers (X-API-Key), env vars (.env), code snippets, clipboard, OCR |
| **Pattern** | Domain-matched (login.example.com) | Provider-specific (`ghp_`, `AIza`, `sk-`) |
| **Risk** | Wrong password = failed login | Wrong fill = key exposure, spend, data leak |
| **Auto-Fill** | Bitwarden injects after user confirmation | Need stricter conditions (domain whitelist, prompt every time) |
| **Confidentiality** | One-time per session; low replay risk | Persistent; reusable in agents/bridges; must encrypt immediately |

---

## 2. Bitwarden vs KeyShield

**Bitwarden**:
- Detects passwords via content script scanning DOM for login forms.
- Matches to vault by URI/domain.
- Fill: On page load, injects if match + unlocked vault.
- Local-first (vault sync optional).

**KeyShield**:
- Detection triggers on forms, clipboard, (future) HTTP headers, OCR.
- Matches by provider pattern (GitHub, OpenAI, Helius, etc.).
- On detection: encrypt with Lit, store hash on-chain; ciphertext in IndexedDB.
- On fill: pull from chain + Lit decrypt only when conditions met.
- On-chain-first (Solana PDA for vault; Lit for conditions).

---

## 3. KeyShield Detection Flow (Conceptual Code)

### 3.1 Form Field Scanning (Bitwarden-Style)

```javascript
// frontend/content.js (conceptual)
function detectFormFields() {
  const inputs = document.querySelectorAll(
    'input[type="text"], input[type="password"], input:not([type])'
  );
  inputs.forEach((input) => {
    const name = (input.name || input.id || '').toLowerCase();
    const placeholder = (input.placeholder || '').toLowerCase();
    if (
      /api[_-]?key|token|secret|apikey|auth[_-]?key/i.test(name) ||
      /api key|token|secret/i.test(placeholder)
    ) {
      const value = input.value?.trim();
      if (value) {
        const detected = detectKeyPattern(value);
        if (detected) {
          chrome.runtime.sendMessage({
            type: 'KEY_DETECTED',
            provider: detected.provider,
            key: value,
            url: window.location.href,
            source: 'form',
          });
        }
      }
    }
  });
}
```

### 3.2 Clipboard Monitoring (API-Specific)

```javascript
document.addEventListener('paste', async (e) => {
  const text = (e.clipboardData?.getData('text') || '').trim();
  if (!text) return;
  const detected = detectKeyPattern(text);
  if (detected) {
    chrome.runtime.sendMessage({
      type: 'KEY_DETECTED',
      provider: detected.provider,
      key: text,
      url: window.location.href,
      source: 'clipboard',
    });
  }
});
```

### 3.3 HTTP Header Interception (Service Worker)

Requires `webRequest` and `webRequestBlocking` (or declarativeNetRequest) in manifest. Conceptual:

```javascript
// frontend/background.js (conceptual)
chrome.webRequest?.onBeforeSendHeaders?.addListener(
  (details) => {
    const headers = details.requestHeaders || [];
    const apiKeyHeader = headers.find(
      (h) =>
        /x-api-key|authorization|api-key/i.test(h.name) && h.value
    );
    if (apiKeyHeader) {
      const detected = detectKeyPattern(apiKeyHeader.value);
      if (detected) {
        chrome.runtime.sendMessage({
          type: 'KEY_DETECTED',
          provider: detected.provider,
          key: apiKeyHeader.value,
          url: details.url,
          source: 'request',
        });
      }
    }
  },
  { urls: ['<all_urls>'] },
  ['requestHeaders']
);
```

---

## 4. Detection Patterns (Provider-Specific)

```javascript
function detectKeyPattern(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();

  // GitHub
  if (/^gh[porus]_[A-Za-z0-9]{36}$/.test(trimmed)) {
    return { provider: 'GitHub', pattern: 'ghp_|gho_|ghu_|ghs_|ghr_' };
  }

  // OpenAI
  if (/^sk-[A-Za-z0-9]{48}$/.test(trimmed)) {
    return { provider: 'OpenAI', pattern: 'sk-' };
  }

  // Google Gemini
  if (/^AIza[A-Za-z0-9_-]{35}$/.test(trimmed)) {
    return { provider: 'GoogleGemini', pattern: 'AIza' };
  }

  // Helius / Solana RPC (32–64 hex)
  if (/^[a-f0-9]{32,64}$/i.test(trimmed) && trimmed.length >= 32) {
    return { provider: 'Helius', pattern: 'hex32-64' };
  }

  // bloXroute (long alphanumeric)
  if (/^[A-Za-z0-9]{40,}$/.test(trimmed)) {
    return { provider: 'bloXroute', pattern: 'alphanumeric40+' };
  }

  return null;
}
```

---

## 5. Auto-Fill Risks and Safeguards

**Passwords**: Wrong fill usually just fails login.

**API Keys**: Wrong fill can:
- Expose key to a malicious site.
- Send key in a request to an attacker.

**KeyShield safeguards**:
- **Domain whitelist**: Only offer fill on trusted domains (e.g. dashboard.helius.dev, api.openai.com).
- **User prompt every time**: Require explicit “Use key for this site” before fill.
- **Lit conditions**: Decrypt only when wallet matches and (optional) time-lock/other conditions.
- **No auto-inject on load**: Unlike some password managers, do not auto-fill API keys on page load without user action.

---

## 6. Relevant KeyShield Files

| File | Role |
|------|------|
| `frontend/content.js` | Content script; form + clipboard detection |
| `frontend/background.js` | Service worker; notifications; (future) request interception |
| `frontend/lib/solana.ts` | Vault PDA, metadata, on-chain + local merge |
| `disabled_extension/src/lib/key-detector.ts` | Extended patterns (reference) |

---

## 7. Summary

- **Passwords**: Form-focused, domain-matched, low risk on wrong fill.
- **API Keys**: Multi-source (forms, clipboard, headers, OCR), provider-pattern matched, high risk on wrong fill.
- **KeyShield**: Broad detection (forms + clipboard + future headers/OCR), Lit encryption before storage, on-chain hash, conditional decrypt, and (with MPC) agent coordination without full key reveal.
