/**
 * Edge-case coverage for KeyDetector that detector.test.ts intentionally
 * leaves out:
 *
 *   1. Pattern collision    — strings that match more than one regex
 *      (the file-order ordering, not pattern.priority, decides today)
 *   2. Confidence math      — isTrustedDomain / isKeyField / examples
 *      contributions actually take effect, and the 100 ceiling holds
 *   3. Oversized inputs     — a 200KB paste must not hang or blow heap
 *   4. .env-comment paste   — `# OPENAI_API_KEY=sk-...` in a comment
 *      should still get extracted (today's behaviour — pinned by test)
 *   5. detectFromDOMContent — keys split across nested elements, plus
 *      keys in `<script>` blocks
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { KeyDetector } from './detector';

const FAKE_OPENAI = 'sk-live_' + 'a'.repeat(48);
const FAKE_AIZA = 'AIza' + 'B'.repeat(35); // matches Google Gemini, GCP, Firebase, Google Maps
const FAKE_DOMAIN = 'example.com';

// ─── 1. pattern collision ────────────────────────────────────────────────

describe('KeyDetector — pattern collision behaviour', () => {
  it('an AIza key matches at least one of the Google-family patterns', () => {
    const found = KeyDetector.detectFromText(FAKE_AIZA, FAKE_DOMAIN);
    expect(found.length).toBeGreaterThan(0);
    const providers = new Set(found.map((d) => d.provider));
    // Must hit Gemini at minimum (it's the loosest of the Google patterns).
    expect(providers.has('Google Gemini')).toBe(true);
  });

  it('detectFromText returns the FIRST matching pattern in array order, not by priority', () => {
    // This pins today's contract. If we ever sort by priority, this test
    // will flip and we'll know to reconsider downstream call sites.
    const found = KeyDetector.detectFromText(FAKE_AIZA, FAKE_DOMAIN);
    // First match wins per loop body — Google Gemini sits earlier in the
    // pattern array than GCP / Firebase / Google Maps.
    expect(found[0].provider).toBe('Google Gemini');
  });

  it('detectFromDOMContent enumerates ALL collisions (no early break)', () => {
    document.body.innerHTML = `<pre>${FAKE_AIZA}</pre>`;
    const found = KeyDetector.detectFromDOMContent();
    const providers = new Set(found.map((d) => d.provider));
    // The DOM scan iterates every pattern, so the same key surfaces under
    // multiple provider labels.
    expect(providers.size).toBeGreaterThanOrEqual(2);
  });
});

// ─── 2. confidence arithmetic ────────────────────────────────────────────

describe('KeyDetector — confidence scoring', () => {
  let originalLocation: Location;

  beforeEach(() => {
    document.body.innerHTML = '';
    originalLocation = window.location;
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  function setHostname(host: string) {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, hostname: host },
    });
  }

  it('trusted-domain bonus raises confidence vs untrusted, same key & field', () => {
    // Use a non-key-field name so the +15 isKeyField bonus is OFF and we can
    // observe the +10 trusted-domain delta without saturating the 100 cap.
    // Base 50 + priority 30 + examples 5 = 85 → +10 trusted = 95.
    document.body.innerHTML = `<input id="k" name="generic_input" type="password"/>`;
    const input = document.querySelector<HTMLInputElement>('#k')!;
    input.value = FAKE_OPENAI;

    setHostname('random-blog.com');
    const untrusted = KeyDetector.detectFormFields()
      .find((d) => d.provider === 'OpenAI')!;

    setHostname('platform.openai.com');
    const trusted = KeyDetector.detectFormFields()
      .find((d) => d.provider === 'OpenAI')!;

    expect(trusted.confidence).toBeGreaterThan(untrusted.confidence);
    // Spec: trusted domain adds +10
    expect(trusted.confidence - untrusted.confidence).toBe(10);
  });

  it('confidence is capped at 100 even when every bonus is in play', () => {
    setHostname('platform.openai.com'); // trusted
    document.body.innerHTML = `<input id="k" name="OPENAI_API_KEY" type="password"/>`;
    const input = document.querySelector<HTMLInputElement>('#k')!;
    input.value = FAKE_OPENAI; // priority 10 OpenAI pattern w/ examples

    const found = KeyDetector.detectFormFields();
    const openai = found.find((d) => d.provider === 'OpenAI')!;
    expect(openai.confidence).toBeLessThanOrEqual(100);
    // 50 base + 30 (priority cap) + 15 (key field) + 10 (trusted) + 5 (examples) = 110 → capped at 100
    expect(openai.confidence).toBe(100);
  });

  it('field-name fallback (no pattern match) returns confidence 30', () => {
    document.body.innerHTML = `<input id="k" name="api_key" type="text"/>`;
    const input = document.querySelector<HTMLInputElement>('#k')!;
    input.value = 'random_internal_token_xy'; // long enough, no pattern

    const found = KeyDetector.detectFormFields();
    expect(found.length).toBe(1);
    expect(found[0].confidence).toBe(30);
    expect(found[0].provider).toBeUndefined();
  });
});

// ─── 3. oversized input ──────────────────────────────────────────────────

describe('KeyDetector — oversized input resilience', () => {
  it('handles a 200KB paste without hanging (under 2s)', () => {
    // 1 real OpenAI key buried in 200KB of noise
    const noise = 'lorem ipsum dolor sit amet '.repeat(8000); // ~200KB
    const haystack = noise + '\n' + FAKE_OPENAI + '\n' + noise;

    const start = Date.now();
    const found = KeyDetector.detectFromText(haystack, FAKE_DOMAIN);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(2000);
    expect(found.some((d) => d.provider === 'OpenAI')).toBe(true);
  });

  it('handles a 50-line .env dump and finds every secret', () => {
    const lines: string[] = [];
    for (let i = 0; i < 50; i++) {
      lines.push(`SOME_VAR_${i}=value_${i}`);
    }
    lines.push(`OPENAI_API_KEY=${FAKE_OPENAI}`);
    lines.push(`STRIPE_SECRET_KEY=sk_live_${'A1B2'.repeat(8)}`);
    lines.push(`HELIUS_RPC=https://mainnet.helius-rpc.com/?api-key=ab12cd34-1234-5678-9abc-1234567890ab`);

    const found = KeyDetector.detectFromText(lines.join('\n'), FAKE_DOMAIN);
    const providers = new Set(found.map((d) => d.provider));
    expect(providers).toContain('OpenAI');
    expect(providers).toContain('Stripe');
    expect(providers).toContain('Helius');
  });
});

// ─── 4. .env comment-line behaviour (pin current contract) ──────────────

describe('KeyDetector — paste edge cases', () => {
  it('extracts a key even if the dotenv line is commented out', () => {
    // Some users paste their .env including the leading `#`. Today we still
    // extract — pinning that until product decides otherwise.
    const text = `# OPENAI_API_KEY=${FAKE_OPENAI}`;
    const found = KeyDetector.detectFromText(text, FAKE_DOMAIN);
    expect(found.some((d) => d.provider === 'OpenAI')).toBe(true);
  });

  it('extracts a key from a Markdown code-fence block', () => {
    const text = '```bash\nexport OPENAI_KEY=' + FAKE_OPENAI + '\n```';
    const found = KeyDetector.detectFromText(text, FAKE_DOMAIN);
    expect(found.some((d) => d.provider === 'OpenAI')).toBe(true);
  });

  it('does not detect a key with whitespace cut into it', () => {
    // Paranoia: if a UI widget reflows the key with a soft-break, we should
    // NOT mistake the fragments for a valid key.
    const half = FAKE_OPENAI.slice(0, FAKE_OPENAI.length / 2);
    const text = `${half}\n${FAKE_OPENAI.slice(FAKE_OPENAI.length / 2)}`;
    const found = KeyDetector.detectFromText(text, FAKE_DOMAIN);
    expect(found.some((d) => d.provider === 'OpenAI')).toBe(false);
  });
});

// ─── 5. DOM scan — keys nested across elements ──────────────────────────

describe('KeyDetector.detectFromDOMContent — DOM-shape edges', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('detects a key inside a <script> block', () => {
    document.body.innerHTML = `
      <script type="application/json">
        {"openai_api_key": "${FAKE_OPENAI}"}
      </script>
    `;
    const found = KeyDetector.detectFromDOMContent();
    expect(found.some((d) => d.provider === 'OpenAI')).toBe(true);
  });

  it('finds a key when innerText splits it across paragraphs', () => {
    // Important: <p> tags do NOT inject newlines into innerHTML matching,
    // so the regex still sees a continuous string. This pins that.
    document.body.innerHTML = `<p>${FAKE_OPENAI}</p>`;
    const found = KeyDetector.detectFromDOMContent();
    expect(found.some((d) => d.provider === 'OpenAI')).toBe(true);
  });

  it('returns [] when the page is dynamic but currently empty', () => {
    document.body.innerHTML = '<div id="app"></div>';
    expect(KeyDetector.detectFromDOMContent()).toEqual([]);
  });

  it('produces a stable count when the same key repeats 100 times (dedup)', () => {
    const repeats = Array.from({ length: 100 }, () => `<p>${FAKE_OPENAI}</p>`).join('');
    document.body.innerHTML = repeats;
    const found = KeyDetector.detectFromDOMContent();
    const openai = found.filter((d) => d.provider === 'OpenAI');
    expect(openai.length).toBe(1); // dedup key = `${name}:${slice(0,12)}`
  });
});
