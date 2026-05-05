import { test, expect, Page } from '@playwright/test';

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
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    const now = Math.floor(Date.now() / 1000);

    if (path === '/health') {
      return respond(route, { ok: true });
    }

    if (path === '/manage/list') {
      return respond(route, {
        items: state.vault.map(item => ({
          upstream: item.upstream,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        })),
      });
    }

    if (path === '/manage/store' && method === 'POST') {
      const payload = req.postData() ? JSON.parse(req.postData() || '{}') : {};
      const upstream = String(payload.upstream || 'custom');
      const apiKey = String(payload.apiKey || '');
      state.vault.push({
        upstream,
        createdAt: now,
        updatedAt: now,
        rawKey: apiKey,
      });
      return respond(route, { ok: true });
    }

    if (path.startsWith('/manage/decrypt/')) {
      const upstream = path.replace('/manage/decrypt/', '');
      const found = state.vault.find(item => item.upstream === upstream);
      return respond(route, { key: found?.rawKey ?? '' });
    }

    if (path.startsWith('/manage/secret/') && method === 'DELETE') {
      const upstream = path.replace('/manage/secret/', '');
      state.vault = state.vault.filter(item => item.upstream !== upstream);
      return respond(route, { ok: true });
    }

    if (path === '/agents/list') {
      return respond(route, { agents: state.agents });
    }

    if (path === '/agents/register' && method === 'POST') {
      const payload = req.postData() ? JSON.parse(req.postData() || '{}') : {};
      const agent: AgentEntry = {
        id: state.nextAgentId++,
        pubkey_b58: String(payload.pubkeyB58 || ''),
        name: String(payload.name || ''),
        scopes: String(payload.scopes || '*'),
        created_at: now,
        last_used_at: null,
      };
      state.agents.push(agent);
      return respond(route, { id: agent.id, name: agent.name });
    }

    if (path.startsWith('/agents/') && method === 'DELETE') {
      const id = Number(path.replace('/agents/', ''));
      state.agents = state.agents.filter(agent => agent.id !== id);
      return respond(route, { ok: true });
    }

    if (path === '/usage/history') {
      return respond(route, { history: [] });
    }

    if (path === '/usage/stats') {
      return respond(route, { stats: [] });
    }

    if (path === '/billing/balance') {
      return respond(route, {
        balance_usd: 0,
        total_spent_usd: 0,
        free_credit_usd: 0,
      });
    }

    if (path === '/mpp/streams') {
      return respond(route, {
        streams: [],
        summary: {
          streams_total: 0,
          streams_open: 0,
          tokens_total: 0,
          calls_total: 0,
          settled_usd: 0,
          pending_usd: 0,
        },
      });
    }

    if (path === '/mpp/events') {
      return respond(route, { events: [] });
    }

    return respond(route, { ok: true });
  });

  return state;
};

const openVaultModal = async (page: Page) => {
  await page.getByRole('button', { name: 'New secret' }).click();
  await expect(page.getByRole('heading', { name: 'New secret' })).toBeVisible();
};

test('manual save: API key', async ({ page }) => {
  await installMockApi(page);
  await seedAuth(page);

  await page.goto('/');
  await openVaultModal(page);

  const apiKeyInput = page
    .locator('label:has-text("API key")')
    .locator('..')
    .locator('input');

  await apiKeyInput.fill('sk-proj-test-12345678901234567890');
  await page.getByRole('button', { name: 'Save secret' }).click();

  await expect(page.getByRole('heading', { name: 'OpenAI' })).toBeVisible();
});

test('manual save: env secret', async ({ page }) => {
  await installMockApi(page);
  await seedAuth(page);

  await page.goto('/');
  await openVaultModal(page);

  await page.getByRole('button', { name: '.env file' }).click();

  const nameInput = page
    .locator('label:has-text("App / project")')
    .locator('..')
    .locator('input');
  await nameInput.fill('backend staging');

  const envInput = page
    .locator('label:has-text("Environment variables")')
    .locator('..')
    .locator('textarea');
  await envInput.fill('API_TOKEN=test-value\nSENTRY_DSN=https://example');

  await page.getByRole('button', { name: 'Save secret' }).click();
  await expect(page.getByRole('heading', { name: 'backend staging' })).toBeVisible();
});

test('auto-detect deep link pre-fills modal', async ({ page }) => {
  await installMockApi(page);
  await seedAuth(page);

  await page.goto('/?action=add&upstream=openai&name=OpenAI%20Key&value=sk-proj-auto-1234567890&domain=platform.openai.com');

  const apiKeyInput = page
    .locator('label:has-text("API key")')
    .locator('..')
    .locator('input');

  await expect(page.getByRole('heading', { name: 'New secret' })).toBeVisible();
  await expect(apiKeyInput).toHaveValue('sk-proj-auto-1234567890');

  await page.getByRole('button', { name: 'Save secret' }).click();
  await expect(page.getByRole('heading', { name: 'OpenAI' })).toBeVisible();
});

test('agent register and revoke', async ({ page }) => {
  await installMockApi(page);
  await seedAuth(page);

  await page.goto('/');
  await page.getByRole('button', { name: 'Agents' }).click();

  await page.getByPlaceholder('Agent name (e.g. trading-bot-v1)').fill('qa-agent');
  await page.getByPlaceholder('Agent public key (base58)').fill('4s3Yk1NyFQKkCqW2GMk1mN6S8Uh8x5X2MZf8xdUzG2pR');
  await page.getByRole('button', { name: 'Register' }).click();

  const exactAgentName = page.getByText('qa-agent', { exact: true });
  await expect(exactAgentName).toBeVisible();

  const revoke = page.getByRole('button', { name: 'Revoke' }).first();
  await revoke.click();
  await revoke.click();

  await expect(exactAgentName).toHaveCount(0);
});

test('vault items persist after reload', async ({ page }) => {
  await installMockApi(page);
  await seedAuth(page);

  await page.goto('/');
  await openVaultModal(page);

  const apiKeyInput = page
    .locator('label:has-text("API key")')
    .locator('..')
    .locator('input');

  await apiKeyInput.fill('sk-proj-persist-1234567890');
  await page.getByRole('button', { name: 'Save secret' }).click();
  await expect(page.getByRole('heading', { name: 'OpenAI' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'OpenAI' })).toBeVisible();
});
