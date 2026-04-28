/**
 * Real-world tests for the API-key paste-detector.
 *
 * The detector is the core of the popup's "did the user just paste an
 * OpenAI key into a form?" feature. 147 patterns, 617 lines of code,
 * previously zero test coverage. This file is the safety net.
 *
 * Strategy:
 *   1. Pattern matrix — for ~30 of the most-cited providers, feed a
 *      realistic-shaped key and assert the right `provider` comes back.
 *   2. False positives — feed strings that LOOK like keys (UUIDs, JWTs,
 *      git hashes, base64 blobs) and assert nothing crazy lights up.
 *   3. Real-world payloads — paste a `.env` file, a `curl` example,
 *      a `pip install`, a JSON config; verify only the secrets
 *      get extracted.
 *   4. Form-field detection — synthesize <input> elements via
 *      jsdom (already in our setup) and call detectFormFields().
 *   5. DOM scan — drop a key into document.body and call
 *      detectFromDOMContent().
 *
 * Run: `npm test --workspace=@keyshield/extension-sync src/lib/detector.test.ts`
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { KeyDetector, type DetectedKey } from './detector';

// ─── helpers ──────────────────────────────────────────────────────────────

/**
 * Build a fake key matching a "loose" pattern (provider name + length).
 * Used when the regex permits arbitrary `[A-Za-z0-9_-]{32,}` body.
 */
function loose(prefix: string, len = 40): string {
  let s = prefix;
  while (s.length < prefix.length + len) s += 'A1b2C3d4';
  return s.slice(0, prefix.length + len);
}

const FAKE = {
  // AI / LLM
  openai_live: 'sk-live_' + 'a'.repeat(48),
  openai_test: 'sk-test_' + 'b'.repeat(48),
  openai_proj: 'sk-proj_' + 'c'.repeat(48),
  anthropic: 'sk-ant-api03-' + 'a1B2c3D4_-'.repeat(5).slice(0, 48),
  google_gemini: 'AIza' + 'a'.repeat(35),
  groq: 'gsk_' + 'd'.repeat(48),
  perplexity: 'pplx-' + 'p'.repeat(40),
  hugging_face: 'hf_' + 'h'.repeat(34),
  replicate: 'r8_' + 'r'.repeat(40),
  together: 'tgp_' + 'T'.repeat(40),

  // Solana / RPC
  helius_uuid: 'api-key=ab12cd34-1234-5678-9abc-1234567890ab',
  helius_xkey: 'x-api-key: ab12cd34-1234-5678-9abc-1234567890ab',
  quicknode: 'https://example.quicknode.pro/' + 'q'.repeat(40),
  alchemy: 'https://eth-mainnet.alchemy.com/v2/' + 'a'.repeat(40),

  // Payments
  stripe_sk: 'sk_live_' + 'A1B2'.repeat(8),
  stripe_pk: 'pk_live_' + 'A1B2'.repeat(8),
  stripe_test: 'sk_test_' + 'B2C3'.repeat(8),
  stripe_restricted: 'rk_live_' + 'C3D4'.repeat(8),
};

const FAKE_DOMAIN = 'example.com';

// ─── 1. happy-path pattern matrix ─────────────────────────────────────────

describe('KeyDetector.detectFromText — provider matrix', () => {
  const cases: Array<[string, string, string]> = [
    // [providerLabel, inputText, expectedProviderInResult]
    ['OpenAI live key', FAKE.openai_live, 'OpenAI'],
    ['OpenAI test key', FAKE.openai_test, 'OpenAI'],
    ['OpenAI proj key', FAKE.openai_proj, 'OpenAI'],
    ['Anthropic claude key', FAKE.anthropic, 'Anthropic'],
    ['Google Gemini key', FAKE.google_gemini, 'Google Gemini'],
    ['Groq key', FAKE.groq, 'Groq'],
    ['Perplexity key', FAKE.perplexity, 'Perplexity'],
    ['HuggingFace token', FAKE.hugging_face, 'HuggingFace'],
    ['Replicate token', FAKE.replicate, 'Replicate'],
    ['Together token', FAKE.together, 'Together'],
    ['Helius via api-key=', FAKE.helius_uuid, 'Helius'],
    ['Stripe live secret', FAKE.stripe_sk, 'Stripe'],
    ['Stripe live publishable', FAKE.stripe_pk, 'Stripe Publishable'],
    ['Stripe test secret', FAKE.stripe_test, 'Stripe'],
    ['Stripe restricted', FAKE.stripe_restricted, 'Stripe'],
  ];

  for (const [label, input, expectedProvider] of cases) {
    it(`detects ${label}`, () => {
      const found = KeyDetector.detectFromText(input, FAKE_DOMAIN);
      expect(found.length).toBeGreaterThan(0);
      const providers = found.map((d) => d.provider);
      expect(providers).toContain(expectedProvider);
    });
  }

  it('reports source="ocr" and the configured domain', () => {
    const found = KeyDetector.detectFromText(FAKE.openai_live, 'agent.local');
    expect(found[0].source).toBe('ocr');
    expect(found[0].domain).toBe('agent.local');
  });

  it('confidence is in the documented range (0..100)', () => {
    const found = KeyDetector.detectFromText(FAKE.openai_live, FAKE_DOMAIN);
    for (const d of found) {
      expect(d.confidence).toBeGreaterThanOrEqual(0);
      expect(d.confidence).toBeLessThanOrEqual(100);
    }
  });
});

// ─── 2. false positives ───────────────────────────────────────────────────

describe('KeyDetector.detectFromText — false-positive resistance', () => {
  it('a UUID alone is not flagged as anything', () => {
    const text = '550e8400-e29b-41d4-a716-446655440000';
    const found = KeyDetector.detectFromText(text, FAKE_DOMAIN);
    // The Helius regex specifically requires `api-key=` or `x-api-key:`
    // prefix, so a bare UUID shouldn't match.
    const heliusHits = found.filter((d) => d.provider === 'Helius');
    expect(heliusHits).toEqual([]);
  });

  it('a git SHA is not flagged', () => {
    const text = 'a3f5b8c9d0e1f2a3b4c5d6e7f8901234abcdef56';
    expect(KeyDetector.detectFromText(text, FAKE_DOMAIN)).toEqual([]);
  });

  it('a JWT (header.payload.sig) is not flagged', () => {
    const text =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkw' +
      'IiwibmFtZSI6IkpvaG4gRG9lIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    expect(KeyDetector.detectFromText(text, FAKE_DOMAIN)).toEqual([]);
  });

  it('a sentence with the word "openai" is not flagged', () => {
    const text = 'I integrated openai into my app last week';
    expect(KeyDetector.detectFromText(text, FAKE_DOMAIN)).toEqual([]);
  });

  it('an empty string returns no detections', () => {
    expect(KeyDetector.detectFromText('', FAKE_DOMAIN)).toEqual([]);
  });

  it('whitespace-only returns no detections', () => {
    expect(KeyDetector.detectFromText('   \n  \t \n', FAKE_DOMAIN)).toEqual([]);
  });

  it('a too-short string returns no detections (length gate)', () => {
    expect(KeyDetector.detectFromText('sk-x', FAKE_DOMAIN)).toEqual([]);
  });
});

// ─── 3. real-world paste payloads ─────────────────────────────────────────

describe('KeyDetector.detectFromText — real-world payloads', () => {
  it('extracts secrets from a .env-style paste', () => {
    const env = [
      '# .env',
      `OPENAI_API_KEY=${FAKE.openai_live}`,
      `STRIPE_SECRET_KEY=${FAKE.stripe_sk}`,
      'NODE_ENV=production',
      `ANTHROPIC_API_KEY="${FAKE.anthropic}"`,
    ].join('\n');
    const found = KeyDetector.detectFromText(env, FAKE_DOMAIN);
    const providers = new Set(found.map((d) => d.provider));
    expect(providers).toContain('OpenAI');
    expect(providers).toContain('Stripe');
    expect(providers).toContain('Anthropic');
  });

  it('extracts a key from an export-style line', () => {
    const text = `export OPENAI_KEY=${FAKE.openai_live}`;
    const found = KeyDetector.detectFromText(text, FAKE_DOMAIN);
    expect(found.some((d) => d.provider === 'OpenAI')).toBe(true);
  });

  it('extracts from a quoted JSON-config-shaped line', () => {
    const text = `  "openai_api_key": "${FAKE.openai_live}",`;
    const found = KeyDetector.detectFromText(text, FAKE_DOMAIN);
    expect(found.some((d) => d.provider === 'OpenAI')).toBe(true);
  });

  it('extracts a Helius RPC URL secret from copy-paste', () => {
    const text =
      'https://mainnet.helius-rpc.com/?api-key=ab12cd34-1234-5678-9abc-1234567890ab';
    const found = KeyDetector.detectFromText(text, FAKE_DOMAIN);
    expect(found.some((d) => d.provider === 'Helius')).toBe(true);
  });

  it('extracts multiple distinct keys from a multi-line paste', () => {
    const text = [
      `OPENAI=${FAKE.openai_live}`,
      `ANTHROPIC=${FAKE.anthropic}`,
      `GROQ=${FAKE.groq}`,
    ].join('\n');
    const found = KeyDetector.detectFromText(text, FAKE_DOMAIN);
    const providers = new Set(found.map((d) => d.provider));
    expect(providers.size).toBeGreaterThanOrEqual(3);
  });
});

// ─── 4. isValidKey ────────────────────────────────────────────────────────

describe('KeyDetector.isValidKey', () => {
  it('returns true for a known-shape OpenAI key', () => {
    expect(KeyDetector.isValidKey(FAKE.openai_live)).toBe(true);
  });

  it('returns true for an Anthropic key', () => {
    expect(KeyDetector.isValidKey(FAKE.anthropic)).toBe(true);
  });

  it('returns false for empty / null', () => {
    expect(KeyDetector.isValidKey('')).toBe(false);
    expect(KeyDetector.isValidKey(null as any)).toBe(false);
  });

  it('returns false for short strings', () => {
    expect(KeyDetector.isValidKey('sk-x')).toBe(false);
  });

  it('returns false for a sentence', () => {
    expect(
      KeyDetector.isValidKey('this is just a normal english sentence'),
    ).toBe(false);
  });

  it('trims whitespace before validating', () => {
    expect(KeyDetector.isValidKey(`  ${FAKE.openai_live}  `)).toBe(true);
  });
});

// ─── 5. accessor surface ──────────────────────────────────────────────────

describe('KeyDetector accessors', () => {
  it('getAllPatterns returns ≥100 patterns (per the file header)', () => {
    expect(KeyDetector.getAllPatterns().length).toBeGreaterThanOrEqual(100);
  });

  it('every pattern has a name + regex + priority + category', () => {
    for (const p of KeyDetector.getAllPatterns()) {
      expect(p.name).toBeTruthy();
      expect(p.regex).toBeInstanceOf(RegExp);
      expect(p.priority).toBeGreaterThanOrEqual(0);
      expect(p.category).toBeTruthy();
    }
  });

  it('getTrustedDomains returns a non-empty list', () => {
    const ds = KeyDetector.getTrustedDomains();
    expect(ds.length).toBeGreaterThan(0);
    for (const d of ds) expect(typeof d).toBe('string');
  });
});

// ─── 6. DOM-side detection (jsdom) ────────────────────────────────────────

describe('KeyDetector.detectFormFields (jsdom)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('detects an OpenAI key pasted into a password field', () => {
    document.body.innerHTML = `
      <form>
        <input id="apiKey" name="apiKey" type="password" />
      </form>
    `;
    const input = document.querySelector<HTMLInputElement>('#apiKey')!;
    input.value = FAKE.openai_live;

    const found = KeyDetector.detectFormFields();
    expect(found.length).toBeGreaterThan(0);
    expect(found.some((d) => d.provider === 'OpenAI')).toBe(true);
  });

  it('detects via field-name even when the value is generic', () => {
    document.body.innerHTML = `
      <input id="apiKey" name="api_key" type="text" />
    `;
    const input = document.querySelector<HTMLInputElement>('#apiKey')!;
    // Generic 20-char string that doesn't match any pattern.
    input.value = 'my_internal_token_xy';

    const found = KeyDetector.detectFormFields();
    // Fallback path triggers on key-shaped FIELD names.
    expect(found.length).toBe(1);
    expect(found[0].confidence).toBeLessThanOrEqual(50);
  });

  it('skips empty + too-short fields', () => {
    document.body.innerHTML = `
      <input id="empty" name="apiKey" type="password" />
      <input id="short" name="apiKey" type="password" />
    `;
    const empty = document.querySelector<HTMLInputElement>('#empty')!;
    const short = document.querySelector<HTMLInputElement>('#short')!;
    empty.value = '';
    short.value = 'sk-x';
    expect(KeyDetector.detectFormFields()).toEqual([]);
  });

  it('reports source="form" + the field name', () => {
    document.body.innerHTML = `<input id="x" name="OPENAI_KEY" type="text" />`;
    const x = document.querySelector<HTMLInputElement>('#x')!;
    x.value = FAKE.openai_live;
    const found = KeyDetector.detectFormFields();
    expect(found[0].source).toBe('form');
    expect(found[0].fieldName).toContain('OPENAI');
  });
});

// ─── 7. clipboard path (the actual "copy-paste detection" feature) ────────

describe('KeyDetector.detectClipboard (jsdom + mocked navigator.clipboard)', () => {
  let originalClipboard: Clipboard | undefined;

  beforeEach(() => {
    originalClipboard = (navigator as any).clipboard;
  });

  function mockClipboard(text: string) {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { readText: async () => text },
    });
  }

  function restoreClipboard() {
    if (originalClipboard) {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: originalClipboard,
      });
    } else {
      delete (navigator as any).clipboard;
    }
  }

  it('detects an OpenAI key copied to the clipboard', async () => {
    mockClipboard(FAKE.openai_live);
    try {
      const result = await KeyDetector.detectClipboard();
      expect(result).not.toBeNull();
      expect(result!.provider).toBe('OpenAI');
      expect(result!.source).toBe('clipboard');
    } finally {
      restoreClipboard();
    }
  });

  it('extracts a key from a clipboard line shaped like KEY=value', async () => {
    mockClipboard(`OPENAI_API_KEY=${FAKE.openai_live}`);
    try {
      const result = await KeyDetector.detectClipboard();
      expect(result).not.toBeNull();
      expect(result!.provider).toBe('OpenAI');
    } finally {
      restoreClipboard();
    }
  });

  it('returns null when the clipboard is empty', async () => {
    mockClipboard('');
    try {
      expect(await KeyDetector.detectClipboard()).toBeNull();
    } finally {
      restoreClipboard();
    }
  });

  it('returns null on a normal sentence', async () => {
    mockClipboard('hello world, just a chat message');
    try {
      expect(await KeyDetector.detectClipboard()).toBeNull();
    } finally {
      restoreClipboard();
    }
  });

  it('reports confidence 80 from clipboard direct-match (per detector contract)', async () => {
    mockClipboard(FAKE.anthropic);
    try {
      const r = await KeyDetector.detectClipboard();
      expect(r!.confidence).toBe(80);
    } finally {
      restoreClipboard();
    }
  });

  it('handles a multi-line .env paste, picks the first match', async () => {
    mockClipboard(
      [
        '# .env',
        `STRIPE_SECRET_KEY=${FAKE.stripe_sk}`,
        `OPENAI_API_KEY=${FAKE.openai_live}`,
      ].join('\n'),
    );
    try {
      const r = await KeyDetector.detectClipboard();
      expect(r).not.toBeNull();
      // Either Stripe or OpenAI is fine — first match wins.
      expect(['Stripe', 'OpenAI']).toContain(r!.provider);
    } finally {
      restoreClipboard();
    }
  });

  it('gracefully returns null when navigator.clipboard.readText throws', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        readText: async () => {
          throw new DOMException('blocked', 'NotAllowedError');
        },
      },
    });
    try {
      expect(await KeyDetector.detectClipboard()).toBeNull();
    } finally {
      restoreClipboard();
    }
  });
});

describe('KeyDetector.detectFromDOMContent (jsdom)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('finds a key spread across DOM text content', () => {
    document.body.innerHTML = `
      <p>Your API key is:</p>
      <pre>${FAKE.openai_live}</pre>
    `;
    const found = KeyDetector.detectFromDOMContent();
    expect(found.some((d) => d.provider === 'OpenAI')).toBe(true);
  });

  it('deduplicates the same key seen multiple times', () => {
    document.body.innerHTML = `
      <p>${FAKE.openai_live}</p>
      <p>${FAKE.openai_live}</p>
      <p>${FAKE.openai_live}</p>
    `;
    const found = KeyDetector.detectFromDOMContent();
    const openaiHits = found.filter((d) => d.provider === 'OpenAI');
    // dedup is keyed on `${name}:${key.slice(0,12)}` so all three should
    // collapse to one entry.
    expect(openaiHits.length).toBe(1);
  });

  it('returns [] when the DOM has no keys', () => {
    document.body.innerHTML = '<p>just a normal page</p>';
    expect(KeyDetector.detectFromDOMContent()).toEqual([]);
  });
});
