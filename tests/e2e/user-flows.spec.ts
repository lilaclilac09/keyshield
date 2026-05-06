/**
 * KeyShield — real user flow tests
 *
 * Each test group covers exactly what a real user would do:
 * open the app, interact with the UI, and verify the result.
 *
 * Shared helpers (seedAuth, installMockApi) mirror key-capture.spec.ts
 * so both files work against the same dev server and mock contract.
 */

import { test, expect, Page } from '@playwright/test';

// ─── Types ────────────────────────────────────────────────────────────────────

type VaultEntry = {
  upstream: string;
  createdAt: number;
  updatedAt: number;
  rawKey: string;
};

type AgentEntry = {
  id: number;
  pubkey_b58: string;
  name: string;
  scopes: string;
  created_at: number;
  last_used_at: number | null;
};

const API_BASE = 'http://localhost:8000';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Seed localStorage so the app skips AuthScreen and boots straight to the vault.
 */
const seedAuth = async (page: Page) => {
  await page.addInitScript(
    ({ token, wallet }) => {
      localStorage.setItem('ks_token', token);
      localStorage.setItem('ks_wallet', wallet);
    },
    {
      token: 'test-token',
      wallet: '7Yv3rZ6g9fC5iE1oJb4Ew6w4EJtVq5S3RZ1dNqX9R7uM',
    },
  );
};

/**
 * Wire up an in-memory mock API for every route the frontend calls.
 * Returns `state` so tests can inspect what was stored.
 */
const installMockApi = async (page: Page) => {
  const state = {
    vault: [] as VaultEntry[],
    agents: [] as AgentEntry[],
    nextAgentId: 1,
  };

  const respond = (route: any, body: unknown, status = 200) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });

  await page.route(`${API_BASE}/**`, async route => {
    const req    = route.request();
    const url    = new URL(req.url());
    const path   = url.pathname;
    const method = req.method();
    const now    = Math.floor(Date.now() / 1000);

    // ── health / billing / usage / mpp (always empty stubs) ──────────────
    if (path === '/health')          return respond(route, { ok: true });
    if (path === '/usage/history')   return respond(route, { history: [] });
    if (path === '/usage/stats')     return respond(route, { stats: [] });
    if (path === '/billing/balance') return respond(route, { balance_usd: 0, total_spent_usd: 0, free_credit_usd: 0 });
    if (path === '/mpp/streams')     return respond(route, { streams: [], summary: { streams_total: 0, streams_open: 0, tokens_total: 0, calls_total: 0, settled_usd: 0, pending_usd: 0 } });
    if (path === '/mpp/events')      return respond(route, { events: [] });

    // ── vault ────────────────────────────────────────────────────────────
    if (path === '/manage/list') {
      return respond(route, {
        items: state.vault.map(v => ({
          upstream: v.upstream,
          createdAt: v.createdAt,
          updatedAt: v.updatedAt,
        })),
      });
    }

    if (path === '/manage/store' && method === 'POST') {
      const payload = JSON.parse(req.postData() || '{}');
      state.vault.push({
        upstream: String(payload.upstream ?? 'custom'),
        createdAt: now,
        updatedAt: now,
        rawKey: String(payload.apiKey ?? ''),
      });
      return respond(route, { ok: true });
    }

    if (path.startsWith('/manage/decrypt/')) {
      const upstream = path.replace('/manage/decrypt/', '');
      const found    = state.vault.find(v => v.upstream === upstream);
      return respond(route, { key: found?.rawKey ?? '' });
    }

    if (path.startsWith('/manage/secret/') && method === 'DELETE') {
      const upstream = path.replace('/manage/secret/', '');
      state.vault    = state.vault.filter(v => v.upstream !== upstream);
      return respond(route, { ok: true });
    }

    // ── agents ───────────────────────────────────────────────────────────
    if (path === '/agents/list') {
      return respond(route, { agents: state.agents });
    }

    if (path === '/agents/register' && method === 'POST') {
      const payload = JSON.parse(req.postData() || '{}');
      const agent: AgentEntry = {
        id:           state.nextAgentId++,
        pubkey_b58:   String(payload.pubkeyB58 ?? ''),
        name:         String(payload.name ?? ''),
        scopes:       String(payload.scopes ?? '*'),
        created_at:   now,
        last_used_at: null,
      };
      state.agents.push(agent);
      return respond(route, { id: agent.id, name: agent.name });
    }

    if (path.startsWith('/agents/') && method === 'DELETE') {
      const id    = Number(path.replace('/agents/', ''));
      state.agents = state.agents.filter(a => a.id !== id);
      return respond(route, { ok: true });
    }

    // fallthrough
    return respond(route, { ok: true });
  });

  return state;
};

/** Click the "New secret" header button and assert the modal opened. */
const openNewSecretModal = async (page: Page) => {
  await page.getByRole('button', { name: 'New secret' }).click();
  await expect(page.getByRole('heading', { name: 'New secret' })).toBeVisible();
};

/**
 * Locate the API-key input field inside the modal.
 * The label text is "API key" and the input is a password-type sibling.
 */
const apiKeyInput = (page: Page) =>
  page.locator('label:has-text("API key")').locator('..').locator('input');

// ═══════════════════════════════════════════════════════════════════════════════
//  1.  FIRST-TIME USER EXPERIENCE
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('empty vault state', () => {
  test('new user sees the empty vault with a call-to-action', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);
    await page.goto('/');

    // Stat cards
    await expect(page.getByText('Total secrets')).toBeVisible();
    await expect(page.getByText('Used this week')).toBeVisible();
    await expect(page.getByText('Expiring soon')).toBeVisible();

    // Empty-state copy
    await expect(page.getByText('Your vault is empty')).toBeVisible();
    await expect(page.getByText('Add your first encrypted secret to get started.')).toBeVisible();

    // The "Add a secret" button inside the empty state also opens the modal
    await page.getByRole('button', { name: 'Add a secret' }).click();
    await expect(page.getByRole('heading', { name: 'New secret' })).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  2.  SAVING ALL FIVE SECRET TYPES
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('add secrets — all types', () => {
  test('save an OpenAI API key (default provider)', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);
    await page.goto('/');
    await openNewSecretModal(page);

    // Provider defaults to OpenAI
    await expect(page.locator('select').first()).toHaveValue('openai');

    await apiKeyInput(page).fill('sk-proj-testkey-1234567890abcdef');
    await page.getByRole('button', { name: 'Save secret' }).click();

    // Card appears, modal closes
    await expect(page.getByRole('heading', { name: 'New secret' })).not.toBeVisible();
    await expect(page.getByRole('heading', { name: 'OpenAI' })).toBeVisible();
    await expect(page.getByText('openai.com')).toBeVisible();
  });

  test('switch provider to Anthropic before saving', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);
    await page.goto('/');
    await openNewSecretModal(page);

    await page.locator('select').first().selectOption('anthropic');
    await apiKeyInput(page).fill('sk-ant-api03-test-anthropic-key');
    await page.getByRole('button', { name: 'Save secret' }).click();

    await expect(page.getByRole('heading', { name: 'Anthropic Claude' })).toBeVisible();
    await expect(page.getByText('anthropic.com')).toBeVisible();
  });

  test('save a Groq API key', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);
    await page.goto('/');
    await openNewSecretModal(page);

    await page.locator('select').first().selectOption('groq');
    await apiKeyInput(page).fill('gsk_live_testgroqkey123456');
    await page.getByRole('button', { name: 'Save secret' }).click();

    await expect(page.getByRole('heading', { name: 'Groq' })).toBeVisible();
  });

  test('optional label is accepted; card still shows the provider name (label not round-tripped via API)', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);
    await page.goto('/');
    await openNewSecretModal(page);

    // Give a custom label — the modal accepts it, but after the API round-trip the
    // card name is reconstructed from UPSTREAM_META (provider name), not the label.
    await page.locator('input[placeholder="e.g. Production API key"]').fill('My Production Key');
    await apiKeyInput(page).fill('sk-proj-prod-labeled-key');
    await page.getByRole('button', { name: 'Save secret' }).click();

    // The vault card uses the canonical provider name from UPSTREAM_META.
    await expect(page.getByRole('heading', { name: 'OpenAI' })).toBeVisible();
  });

  test('save a password entry for GitHub', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);
    await page.goto('/');
    await openNewSecretModal(page);

    // Switch to Password tab
    await page.getByRole('button', { name: 'Password' }).click();
    await expect(page.getByText('Username + password for any site')).toBeVisible();

    // Site name
    await page.locator('input[placeholder="e.g. GitHub"]').fill('GitHub');

    // Username + URL
    await page.locator('input[placeholder="alice@example.com"]').fill('alice@example.com');
    await page.locator('input[placeholder="https://github.com"]').fill('https://github.com');

    // Password
    await page.locator('label:has-text("Password")').locator('..').locator('input').fill('hunter2-super-secret!');

    await page.getByRole('button', { name: 'Save secret' }).click();

    await expect(page.getByRole('heading', { name: 'GitHub' })).toBeVisible();
    // Type badge shows "password"
    await expect(page.getByText('password').first()).toBeVisible();
  });

  test('save a secure note with recovery codes', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);
    await page.goto('/');
    await openNewSecretModal(page);

    await page.getByRole('button', { name: 'Secure note' }).click();
    await expect(page.getByText('Encrypted text — recovery codes, secrets, etc.')).toBeVisible();

    // Title
    await page.locator('input[placeholder="e.g. Recovery codes"]').fill('AWS recovery codes');

    // Content
    await page.locator('label:has-text("Content")').locator('..').locator('textarea')
      .fill('1234-ABCD\n5678-EFGH\n9012-IJKL');

    await page.getByRole('button', { name: 'Save secret' }).click();

    await expect(page.getByRole('heading', { name: 'AWS recovery codes' })).toBeVisible();
  });

  test('save a .env file for a staging backend', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);
    await page.goto('/');
    await openNewSecretModal(page);

    await page.getByRole('button', { name: '.env file' }).click();
    await expect(page.getByText('Block of KEY=VALUE pairs for an app')).toBeVisible();

    // Project name
    await page.locator('input[placeholder="e.g. backend-staging"]').fill('backend-staging');

    // Env vars (paste a whole .env file)
    await page.locator('label:has-text("Environment variables")').locator('..').locator('textarea')
      .fill('DATABASE_URL=postgres://localhost/myapp\nSTRIPE_SECRET=sk_live_abc123\nSENTRY_DSN=https://abc@sentry.io/1');

    await page.getByRole('button', { name: 'Save secret' }).click();

    // slugify('backend-staging') → 'backend_staging' → userSecretLabel → 'backend staging'
    await expect(page.getByRole('heading', { name: 'backend staging' })).toBeVisible();
  });

  test('save an SSH key for production deploy access', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);
    await page.goto('/');
    await openNewSecretModal(page);

    await page.getByRole('button', { name: 'SSH key' }).click();
    await expect(page.getByText('Public + private key + passphrase')).toBeVisible();

    // Key name
    await page.locator('input[placeholder="e.g. deploy-key"]').fill('prod-deploy');

    // Public key (optional)
    await page.locator('label:has-text("Public key (optional)")').locator('..').locator('textarea')
      .fill('ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA alice@laptop');

    // Private key (required)
    await page.locator('label:has-text("Private key")').locator('..').locator('textarea')
      .fill('-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\n-----END OPENSSH PRIVATE KEY-----');

    // Comment
    await page.locator('input[placeholder="alice@laptop"]').fill('alice@laptop');

    await page.getByRole('button', { name: 'Save secret' }).click();

    // slugify('prod-deploy') → 'prod_deploy' → userSecretLabel → 'prod deploy'
    await expect(page.getByRole('heading', { name: 'prod deploy' })).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  3.  VALIDATION — modal blocks save on missing required fields
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('validation errors', () => {
  test('API key tab — cannot save without pasting the key', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);
    await page.goto('/');
    await openNewSecretModal(page);

    // No key entered — submit immediately
    await page.getByRole('button', { name: 'Save secret' }).click();

    await expect(page.getByText('Paste the API key')).toBeVisible();
    // Modal stays open
    await expect(page.getByRole('heading', { name: 'New secret' })).toBeVisible();
  });

  test('Password tab — cannot save without a password', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);
    await page.goto('/');
    await openNewSecretModal(page);

    await page.getByRole('button', { name: 'Password' }).click();
    await page.locator('input[placeholder="e.g. GitHub"]').fill('MyApp');
    await page.locator('input[placeholder="alice@example.com"]').fill('alice@example.com');
    // password field intentionally left blank

    await page.getByRole('button', { name: 'Save secret' }).click();

    await expect(page.getByText('Password required')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'New secret' })).toBeVisible();
  });

  test('Secure note tab — cannot save an empty note', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);
    await page.goto('/');
    await openNewSecretModal(page);

    await page.getByRole('button', { name: 'Secure note' }).click();
    await page.locator('input[placeholder="e.g. Recovery codes"]').fill('Title only, no content');
    // content textarea left blank

    await page.getByRole('button', { name: 'Save secret' }).click();

    await expect(page.getByText('Write something in the note')).toBeVisible();
  });

  test('.env tab — cannot save without any KEY=VALUE pairs', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);
    await page.goto('/');
    await openNewSecretModal(page);

    await page.getByRole('button', { name: '.env file' }).click();
    await page.locator('input[placeholder="e.g. backend-staging"]').fill('my-app');
    // env textarea left blank

    await page.getByRole('button', { name: 'Save secret' }).click();

    await expect(page.getByText('Paste at least one KEY=VALUE line')).toBeVisible();
  });

  test('SSH key tab — cannot save without a private key', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);
    await page.goto('/');
    await openNewSecretModal(page);

    await page.getByRole('button', { name: 'SSH key' }).click();
    await page.locator('input[placeholder="e.g. deploy-key"]').fill('my-key');
    // private key textarea left blank

    await page.getByRole('button', { name: 'Save secret' }).click();

    await expect(page.getByText('Private key required')).toBeVisible();
  });

  test('switching type tab clears the previous error', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);
    await page.goto('/');
    await openNewSecretModal(page);

    // Trigger API key error
    await page.getByRole('button', { name: 'Save secret' }).click();
    await expect(page.getByText('Paste the API key')).toBeVisible();

    // Switching tab clears the banner
    await page.getByRole('button', { name: 'Password' }).click();
    await expect(page.getByText('Paste the API key')).not.toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  4.  MODAL DISMISS — cancel, X button, backdrop click
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('modal dismiss', () => {
  test('Cancel button closes the modal without saving', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);
    await page.goto('/');
    await openNewSecretModal(page);

    // Start filling a key
    await apiKeyInput(page).fill('sk-proj-will-be-cancelled');

    await page.getByRole('button', { name: 'Cancel' }).click();

    await expect(page.getByRole('heading', { name: 'New secret' })).not.toBeVisible();
    await expect(page.getByText('Your vault is empty')).toBeVisible(); // nothing saved
  });

  test('X icon button in the modal header closes the modal', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);
    await page.goto('/');
    await openNewSecretModal(page);

    // Click the × (Lucide X icon) inside the modal
    await page.locator('[class*="max-w-2xl"] button:has(svg.lucide-x)').click();

    await expect(page.getByRole('heading', { name: 'New secret' })).not.toBeVisible();
    await expect(page.getByText('Your vault is empty')).toBeVisible();
  });

  test('clicking the backdrop (outside the modal) closes it', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);
    await page.goto('/');
    await openNewSecretModal(page);

    // Click the translucent backdrop behind the modal (dispatchEvent bypasses hit-testing)
    await page.locator('div[class*="backdrop-blur-sm"]').dispatchEvent('click');

    await expect(page.getByRole('heading', { name: 'New secret' })).not.toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  5.  REVEAL, COPY & HIDE SECRETS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('reveal and hide secrets', () => {
  test('API key is masked by default and revealed on eye-icon click', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);
    await page.goto('/');
    await openNewSecretModal(page);

    await apiKeyInput(page).fill('sk-proj-reveal-me-abcdef123456');
    await page.getByRole('button', { name: 'Save secret' }).click();
    await expect(page.getByRole('heading', { name: 'OpenAI' })).toBeVisible();

    // Key is masked before reveal
    await expect(page.getByText('••••••••••••••••••••••••')).toBeVisible();

    // Click the eye icon to reveal
    await page.getByTitle('Reveal').click();

    // The actual key appears in the code block
    await expect(page.getByText('sk-proj-reveal-me-abcdef123456')).toBeVisible();

    // Auto-hide countdown is shown
    await expect(page.getByText(/hides in \d+s/)).toBeVisible();
  });

  test('clicking the eye icon again hides the key', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);
    await page.goto('/');
    await openNewSecretModal(page);

    await apiKeyInput(page).fill('sk-proj-hide-me-9876543210');
    await page.getByRole('button', { name: 'Save secret' }).click();

    await page.getByTitle('Reveal').click();
    await expect(page.getByText('sk-proj-hide-me-9876543210')).toBeVisible();

    await page.getByTitle('Hide', { exact: true }).click();

    // Key is masked again, timer gone
    await expect(page.getByText('••••••••••••••••••••••••')).toBeVisible();
    await expect(page.getByText('sk-proj-hide-me-9876543210')).not.toBeVisible();
  });

  test('secure note: Reveal button shows content, Hide now button hides it', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);
    await page.goto('/');
    await openNewSecretModal(page);

    await page.getByRole('button', { name: 'Secure note' }).click();
    await page.locator('input[placeholder="e.g. Recovery codes"]').fill('Secret Plans');
    await page.locator('label:has-text("Content")').locator('..').locator('textarea')
      .fill('World domination begins at 0800 UTC.');
    await page.getByRole('button', { name: 'Save secret' }).click();

    await expect(page.getByRole('heading', { name: 'Secret Plans' })).toBeVisible();

    // Full-width Reveal button for non-API-key types
    await page.getByRole('button', { name: 'Reveal' }).click();

    await expect(page.getByText('World domination begins at 0800 UTC.')).toBeVisible();
    await expect(page.getByText(/REVEALED · hides in \d+s/)).toBeVisible();

    // "Hide now" link collapses the note
    await page.getByRole('button', { name: 'Hide now' }).click();

    await expect(page.getByText('World domination begins at 0800 UTC.')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Reveal' })).toBeVisible();
  });

  test('.env reveal shows each KEY=VALUE pair', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);
    await page.goto('/');
    await openNewSecretModal(page);

    await page.getByRole('button', { name: '.env file' }).click();
    await page.locator('input[placeholder="e.g. backend-staging"]').fill('prod-env');
    await page.locator('label:has-text("Environment variables")').locator('..').locator('textarea')
      .fill('API_TOKEN=secret-token-xyz\nDB_PASS=hunter2');
    await page.getByRole('button', { name: 'Save secret' }).click();

    // slugify('prod-env') → 'prod_env' → userSecretLabel → 'prod env'
    await expect(page.getByRole('heading', { name: 'prod env' })).toBeVisible();

    await page.getByRole('button', { name: 'Reveal' }).click();

    await expect(page.getByText('API_TOKEN=secret-token-xyz')).toBeVisible();
    await expect(page.getByText('DB_PASS=hunter2')).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  6.  DELETE A SECRET
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('delete secrets', () => {
  test('deleting a secret requires two clicks (confirm gate)', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);
    await page.goto('/');
    await openNewSecretModal(page);

    await apiKeyInput(page).fill('sk-proj-delete-me');
    await page.getByRole('button', { name: 'Save secret' }).click();
    await expect(page.getByRole('heading', { name: 'OpenAI' })).toBeVisible();

    // The trash button is opacity-0 until hovered
    const card = page.locator('[class*="group rounded-xl"]').filter({ hasText: 'OpenAI' });
    await card.hover();

    // First click: switches to the confirm state
    await page.getByTitle('Delete (click twice)').click();

    // Second click: confirms deletion
    await page.getByRole('button', { name: 'Confirm' }).click();

    await expect(page.getByRole('heading', { name: 'OpenAI' })).not.toBeVisible();
    await expect(page.getByText('Your vault is empty')).toBeVisible();
  });

  test('after adding two secrets, deleting one leaves the other', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);
    await page.goto('/');

    // Add OpenAI key
    await openNewSecretModal(page);
    await apiKeyInput(page).fill('sk-proj-keep-me');
    await page.getByRole('button', { name: 'Save secret' }).click();
    await expect(page.getByRole('heading', { name: 'OpenAI' })).toBeVisible();

    // Add Anthropic key
    await openNewSecretModal(page);
    await page.locator('select').first().selectOption('anthropic');
    await apiKeyInput(page).fill('sk-ant-delete-me');
    await page.getByRole('button', { name: 'Save secret' }).click();
    await expect(page.getByRole('heading', { name: 'Anthropic Claude' })).toBeVisible();

    // Delete Anthropic
    const anthropicCard = page.locator('[class*="group rounded-xl"]').filter({ hasText: 'Anthropic Claude' });
    await anthropicCard.hover();
    await anthropicCard.getByTitle('Delete (click twice)').click();
    await page.getByRole('button', { name: 'Confirm' }).click();

    await expect(page.getByRole('heading', { name: 'Anthropic Claude' })).not.toBeVisible();
    await expect(page.getByRole('heading', { name: 'OpenAI' })).toBeVisible(); // still there
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  7.  SEARCH / FILTER
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('search vault', () => {
  test('searching filters vault cards by name', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);
    await page.goto('/');

    // Add OpenAI key
    await openNewSecretModal(page);
    await apiKeyInput(page).fill('sk-proj-openai-one');
    await page.getByRole('button', { name: 'Save secret' }).click();
    await expect(page.getByRole('heading', { name: 'OpenAI' })).toBeVisible();

    // Add Anthropic key
    await openNewSecretModal(page);
    await page.locator('select').first().selectOption('anthropic');
    await apiKeyInput(page).fill('sk-ant-api03-two');
    await page.getByRole('button', { name: 'Save secret' }).click();
    await expect(page.getByRole('heading', { name: 'Anthropic Claude' })).toBeVisible();

    // Open search overlay with the search icon button (w-10 h-10 in header)
    await page.locator('header button:has(svg.lucide-search)').click();
    await expect(page.getByPlaceholder('Search your vault…')).toBeVisible();

    await page.getByPlaceholder('Search your vault…').fill('anthropic');

    // Close overlay with Escape to see the filtered grid
    await page.keyboard.press('Escape');

    await expect(page.getByRole('heading', { name: 'Anthropic Claude' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'OpenAI' })).not.toBeVisible();
  });

  test('empty search result shows the no-match message', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);
    await page.goto('/');

    await openNewSecretModal(page);
    await apiKeyInput(page).fill('sk-proj-one');
    await page.getByRole('button', { name: 'Save secret' }).click();

    await page.locator('header button:has(svg.lucide-search)').click();
    await page.getByPlaceholder('Search your vault…').fill('zzz-no-match-xyz');
    await page.keyboard.press('Escape');

    await expect(page.getByText('No secrets match your search.')).toBeVisible();
  });

  test('clearing the search restores all cards', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);
    await page.goto('/');

    await openNewSecretModal(page);
    await apiKeyInput(page).fill('sk-proj-openai-restore');
    await page.getByRole('button', { name: 'Save secret' }).click();

    // Filter
    await page.locator('header button:has(svg.lucide-search)').click();
    await page.getByPlaceholder('Search your vault…').fill('zzz-no-match');
    await page.keyboard.press('Escape');
    await expect(page.getByText('No secrets match your search.')).toBeVisible();

    // Clear filter
    await page.locator('header button:has(svg.lucide-search)').click();
    await page.getByPlaceholder('Search your vault…').clear();
    await page.keyboard.press('Escape');

    await expect(page.getByRole('heading', { name: 'OpenAI' })).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  8.  SIDEBAR NAVIGATION
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('navigation', () => {
  test('user clicks through all eight sidebar sections', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);
    await page.goto('/');

    const sections: Array<[string, string]> = [
      ['Activity',  'Recent reads, writes, and shares'],
      ['Agents',    "Agents you've granted scoped access to"],
      ['Sharing',   'Secrets shared with teammates'],
      ['Sessions',  'Active sessions across devices'],
      ['Settings',  'Account, security, and preferences'],
      ['Developer', 'API token, CLI commands, SDK snippets'],
      ['Docs',      'Quickstart, agent setup, and full reference'],
    ];

    for (const [navLabel, subtitle] of sections) {
      await page.getByRole('button', { name: navLabel }).click();
      await expect(page.getByText(subtitle)).toBeVisible();
    }

    // Back to Vault
    await page.getByRole('button', { name: 'Vault' }).click();
    await expect(page.getByText('All your encrypted secrets')).toBeVisible();
  });

  test('"New secret" button only appears in the Vault section', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);
    await page.goto('/');

    await expect(page.getByRole('button', { name: 'New secret' })).toBeVisible();

    await page.getByRole('button', { name: 'Activity' }).click();
    await expect(page.getByRole('button', { name: 'New secret' })).not.toBeVisible();

    await page.getByRole('button', { name: 'Vault' }).click();
    await expect(page.getByRole('button', { name: 'New secret' })).toBeVisible();
  });

  test('Developer section has a DEV badge in the sidebar', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);
    await page.goto('/');

    // DEV badge is always visible in the nav (exact so the parent button text doesn't also match)
    await expect(page.getByText('DEV', { exact: true })).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  9.  AGENT MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('agents', () => {
  test('Agents section starts with an empty list and explains the 3-step flow', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Agents' }).click();

    await expect(page.getByText('No agents registered yet')).toBeVisible();
    // exact: true so "Step 1 — generate keypair" labels in the form don't also match
    await expect(page.getByText('Step 1', { exact: true })).toBeVisible();
    await expect(page.getByText('Step 2', { exact: true })).toBeVisible();
    await expect(page.getByText('Step 3', { exact: true })).toBeVisible();
  });

  test('Register button is disabled until both name and pubkey are filled', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Agents' }).click();

    const registerBtn = page.getByRole('button', { name: 'Register' });
    await expect(registerBtn).toBeDisabled();

    await page.getByPlaceholder('Agent name (e.g. trading-bot-v1)').fill('my-agent');
    await expect(registerBtn).toBeDisabled(); // still missing pubkey

    await page.getByPlaceholder('Agent public key (base58)').fill('4s3Yk1NyFQKkCqW2GMk1mN6S8Uh8x5X2MZf8xdUzG2pR');
    await expect(registerBtn).toBeEnabled();
  });

  test('user generates a keypair — private key is shown, pubkey auto-fills the input', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Agents' }).click();

    await page.getByRole('button', { name: 'Generate' }).click();

    // Security warning shown
    await expect(page.getByText("Save the private key NOW — it won't be shown again")).toBeVisible();

    // Generated pubkey auto-filled the input
    const pubkeyInput = page.getByPlaceholder('Agent public key (base58)');
    const pubkeyValue = await pubkeyInput.inputValue();
    expect(pubkeyValue.length).toBeGreaterThan(20);

    // Private key panel is visible
    await expect(page.getByText('Private key (KS_AGENT_KEY env var)')).toBeVisible();
  });

  test('user registers an agent with a manually pasted pubkey', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Agents' }).click();

    await page.getByPlaceholder('Agent name (e.g. trading-bot-v1)').fill('data-fetcher');
    await page.getByPlaceholder('Agent public key (base58)').fill('4s3Yk1NyFQKkCqW2GMk1mN6S8Uh8x5X2MZf8xdUzG2pR');
    await page.getByRole('button', { name: 'Register' }).click();

    // Success banner
    await expect(page.getByText('Agent "data-fetcher" registered')).toBeVisible();
    // Agent row appears in the list (exact so the success banner text doesn't also match)
    await expect(page.getByText('data-fetcher', { exact: true })).toBeVisible();
  });

  test('user can set a scoped grant (proxy only) when registering', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Agents' }).click();

    await page.getByPlaceholder('Agent name (e.g. trading-bot-v1)').fill('limited-bot');
    await page.getByPlaceholder('Agent public key (base58)').fill('4s3Yk1NyFQKkCqW2GMk1mN6S8Uh8x5X2MZf8xdUzG2pR');
    await page.locator('select').selectOption('proxy');
    await page.getByRole('button', { name: 'Register' }).click();

    await expect(page.getByText('limited-bot', { exact: true })).toBeVisible();
    // Scope badge (exact so "proxy,read" option text doesn't also match)
    await expect(page.getByText('proxy', { exact: true })).toBeVisible();
  });

  test('user registers a second agent after generating a fresh keypair', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Agents' }).click();

    // Register first agent manually
    await page.getByPlaceholder('Agent name (e.g. trading-bot-v1)').fill('first-bot');
    await page.getByPlaceholder('Agent public key (base58)').fill('4s3Yk1NyFQKkCqW2GMk1mN6S8Uh8x5X2MZf8xdUzG2pR');
    await page.getByRole('button', { name: 'Register' }).click();
    await expect(page.getByText('first-bot', { exact: true })).toBeVisible();

    // Generate a new keypair for the second agent
    await page.getByRole('button', { name: 'Generate' }).click();
    await page.getByPlaceholder('Agent name (e.g. trading-bot-v1)').fill('second-bot');
    await page.getByRole('button', { name: 'Register' }).click();
    await expect(page.getByText('second-bot', { exact: true })).toBeVisible();

    // Both agents listed (exact: true — success banners contain the names too)
    await expect(page.getByText('first-bot', { exact: true })).toBeVisible();
    await expect(page.getByText('second-bot', { exact: true })).toBeVisible();
  });

  test('revoking an agent requires two clicks and removes it from the list', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Agents' }).click();

    await page.getByPlaceholder('Agent name (e.g. trading-bot-v1)').fill('doomed-bot');
    await page.getByPlaceholder('Agent public key (base58)').fill('4s3Yk1NyFQKkCqW2GMk1mN6S8Uh8x5X2MZf8xdUzG2pR');
    await page.getByRole('button', { name: 'Register' }).click();
    // exact: true matches the agent-row span ("doomed-bot"), not the banner ("Agent "doomed-bot" registered")
    await expect(page.getByText('doomed-bot', { exact: true })).toBeVisible();

    // Two-click confirmation
    const revokeBtn = page.getByRole('button', { name: 'Revoke' }).first();
    await revokeBtn.click();  // first click → confirm state
    await revokeBtn.click();  // second click → executes revoke

    // After revoke the row span is gone; banner text is "Agent "doomed-bot" registered" (not an exact match)
    await expect(page.getByText('doomed-bot', { exact: true })).not.toBeVisible();
    await expect(page.getByText('No agents registered yet')).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  10.  BROWSER EXTENSION DEEP LINK
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('deep link from browser extension', () => {
  test('OpenAI key detected by extension: modal opens pre-filled', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);

    await page.goto('/?action=add&upstream=openai&name=OpenAI+Production&value=sk-proj-ext-auto-12345&domain=platform.openai.com');

    // Modal auto-opens
    await expect(page.getByRole('heading', { name: 'New secret' })).toBeVisible();

    // Key is pre-filled
    await expect(apiKeyInput(page)).toHaveValue('sk-proj-ext-auto-12345');

    // Provider is correctly set to OpenAI
    await expect(page.locator('select').first()).toHaveValue('openai');

    // Save it
    await page.getByRole('button', { name: 'Save secret' }).click();
    await expect(page.getByRole('heading', { name: 'OpenAI' })).toBeVisible();

    // URL params cleaned up after save
    expect(page.url()).not.toContain('action=add');
  });

  test('Anthropic key detected by extension: provider auto-selected', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);

    await page.goto('/?action=add&upstream=anthropic&name=Claude+API&value=sk-ant-api03-detected&domain=console.anthropic.com');

    await expect(page.getByRole('heading', { name: 'New secret' })).toBeVisible();
    await expect(apiKeyInput(page)).toHaveValue('sk-ant-api03-detected');
    await expect(page.locator('select').first()).toHaveValue('anthropic');

    await page.getByRole('button', { name: 'Save secret' }).click();
    await expect(page.getByRole('heading', { name: 'Anthropic Claude' })).toBeVisible();
  });

  test('Groq key detected by extension: provider auto-selected', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);

    await page.goto('/?action=add&upstream=groq&name=Groq+Key&value=gsk_live_ext_groq&domain=console.groq.com');

    await expect(page.getByRole('heading', { name: 'New secret' })).toBeVisible();
    await expect(apiKeyInput(page)).toHaveValue('gsk_live_ext_groq');
    await expect(page.locator('select').first()).toHaveValue('groq');

    await page.getByRole('button', { name: 'Save secret' }).click();
    await expect(page.getByRole('heading', { name: 'Groq' })).toBeVisible();
  });

  test('no ?action=add param — modal does NOT auto-open', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);

    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'New secret' })).not.toBeVisible();
    await expect(page.getByText('Your vault is empty')).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  11.  PERSISTENCE ACROSS PAGE RELOADS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('persistence', () => {
  test('a saved API key is still visible after reload', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);
    await page.goto('/');
    await openNewSecretModal(page);

    await apiKeyInput(page).fill('sk-proj-survive-reload');
    await page.getByRole('button', { name: 'Save secret' }).click();
    await expect(page.getByRole('heading', { name: 'OpenAI' })).toBeVisible();

    await page.reload();

    await expect(page.getByRole('heading', { name: 'OpenAI' })).toBeVisible();
  });

  test('multiple secrets all survive a reload', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);
    await page.goto('/');

    // Save OpenAI
    await openNewSecretModal(page);
    await apiKeyInput(page).fill('sk-proj-one');
    await page.getByRole('button', { name: 'Save secret' }).click();
    await expect(page.getByRole('heading', { name: 'OpenAI' })).toBeVisible();

    // Save Anthropic
    await openNewSecretModal(page);
    await page.locator('select').first().selectOption('anthropic');
    await apiKeyInput(page).fill('sk-ant-two');
    await page.getByRole('button', { name: 'Save secret' }).click();
    await expect(page.getByRole('heading', { name: 'Anthropic Claude' })).toBeVisible();

    // Save Groq
    await openNewSecretModal(page);
    await page.locator('select').first().selectOption('groq');
    await apiKeyInput(page).fill('gsk_three');
    await page.getByRole('button', { name: 'Save secret' }).click();
    await expect(page.getByRole('heading', { name: 'Groq' })).toBeVisible();

    await page.reload();

    await expect(page.getByRole('heading', { name: 'OpenAI' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Anthropic Claude' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Groq' })).toBeVisible();
  });

  test('registered agent is still listed after reload', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Agents' }).click();

    await page.getByPlaceholder('Agent name (e.g. trading-bot-v1)').fill('persistent-bot');
    await page.getByPlaceholder('Agent public key (base58)').fill('4s3Yk1NyFQKkCqW2GMk1mN6S8Uh8x5X2MZf8xdUzG2pR');
    await page.getByRole('button', { name: 'Register' }).click();
    await expect(page.getByText('persistent-bot', { exact: true })).toBeVisible();

    await page.reload();
    await page.getByRole('button', { name: 'Agents' }).click();

    await expect(page.getByText('persistent-bot', { exact: true })).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  12.  TYPE TAB UX DETAILS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('type tab UX', () => {
  test('each tab shows a different subtitle below the modal title', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);
    await page.goto('/');
    await openNewSecretModal(page);

    const tabs: Array<[string, string]> = [
      ['API key',      'OpenAI, Anthropic, Helius… proxied with zero-trust'],
      ['Password',     'Username + password for any site'],
      ['Secure note',  'Encrypted text — recovery codes, secrets, etc.'],
      ['.env file',    'Block of KEY=VALUE pairs for an app'],
      ['SSH key',      'Public + private key + passphrase'],
    ];

    for (const [tabLabel, expectedSub] of tabs) {
      await page.getByRole('button', { name: tabLabel }).click();
      await expect(page.getByText(expectedSub)).toBeVisible();
    }
  });

  test('name field label and placeholder update for each type', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);
    await page.goto('/');
    await openNewSecretModal(page);

    // API key → "Label" / optional
    await expect(page.getByText('Label')).toBeVisible();

    // Password → "Site / app"
    await page.getByRole('button', { name: 'Password' }).click();
    await expect(page.getByText('Site / app')).toBeVisible();
    await expect(page.locator('input[placeholder="e.g. GitHub"]')).toBeVisible();

    // Secure note → "Title"
    await page.getByRole('button', { name: 'Secure note' }).click();
    await expect(page.getByText('Title')).toBeVisible();
    await expect(page.locator('input[placeholder="e.g. Recovery codes"]')).toBeVisible();

    // .env file → "App / project"
    await page.getByRole('button', { name: '.env file' }).click();
    await expect(page.getByText('App / project')).toBeVisible();
    await expect(page.locator('input[placeholder="e.g. backend-staging"]')).toBeVisible();

    // SSH key → "Key name"
    await page.getByRole('button', { name: 'SSH key' }).click();
    await expect(page.getByText('Key name')).toBeVisible();
    await expect(page.locator('input[placeholder="e.g. deploy-key"]')).toBeVisible();
  });

  test('Notes textarea is shown for API key, password, and .env — but not for note or SSH', async ({ page }) => {
    await installMockApi(page);
    await seedAuth(page);
    await page.goto('/');
    await openNewSecretModal(page);

    // API key — notes shown
    await expect(page.locator('textarea[placeholder="Optional context"]')).toBeVisible();

    // Password — notes shown
    await page.getByRole('button', { name: 'Password' }).click();
    await expect(page.locator('textarea[placeholder="Optional context"]')).toBeVisible();

    // Secure note — no "Notes" field (it has its own Content textarea)
    await page.getByRole('button', { name: 'Secure note' }).click();
    await expect(page.locator('textarea[placeholder="Optional context"]')).not.toBeVisible();

    // .env — notes shown
    await page.getByRole('button', { name: '.env file' }).click();
    await expect(page.locator('textarea[placeholder="Optional context"]')).toBeVisible();

    // SSH key — no notes field
    await page.getByRole('button', { name: 'SSH key' }).click();
    await expect(page.locator('textarea[placeholder="Optional context"]')).not.toBeVisible();
  });
});
