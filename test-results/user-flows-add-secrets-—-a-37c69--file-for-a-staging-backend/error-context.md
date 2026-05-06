# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: user-flows.spec.ts >> add secrets — all types >> save a .env file for a staging backend
- Location: tests/e2e/user-flows.spec.ts:300:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'backend-staging' })
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByRole('heading', { name: 'backend-staging' })

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]: BETA
      - generic [ref=e7]:
        - text: KeyShield v2.0.0-beta.1
        - generic [ref=e8]: · built 2026-04-29 · expect rough edges, please share feedback
    - generic [ref=e9]:
      - link "Send feedback →" [ref=e10] [cursor=pointer]:
        - /url: https://github.com/lilaclilac09/keyshield/issues/new?labels=beta-feedback&title=%5Bbeta%5D+
        - img [ref=e11]
        - text: Send feedback →
      - button "Hide for 24 hours" [ref=e13] [cursor=pointer]:
        - img [ref=e14]
  - generic [ref=e17]:
    - generic [ref=e20]:
      - generic [ref=e21]:
        - generic [ref=e22]:
          - heading "New secret" [level=2] [ref=e23]
          - paragraph [ref=e24]: Block of KEY=VALUE pairs for an app
        - button [ref=e25] [cursor=pointer]:
          - img [ref=e26]
      - generic [ref=e30]:
        - button "API key" [ref=e31] [cursor=pointer]:
          - img [ref=e32]
          - generic [ref=e36]: API key
        - button "Password" [ref=e37] [cursor=pointer]:
          - img [ref=e38]
          - generic [ref=e41]: Password
        - button "Secure note" [ref=e42] [cursor=pointer]:
          - img [ref=e43]
          - generic [ref=e46]: Secure note
        - button ".env file" [ref=e47] [cursor=pointer]:
          - img [ref=e48]
          - generic [ref=e50]: .env file
        - button "SSH key" [ref=e51] [cursor=pointer]:
          - img [ref=e52]
          - generic [ref=e55]: SSH key
      - generic [ref=e56]:
        - generic [ref=e57]:
          - text: App / project
          - textbox "e.g. backend-staging" [ref=e58]: backend-staging
        - generic [ref=e59]:
          - generic [ref=e60]:
            - generic [ref=e61]: Environment variables
            - generic [ref=e62]: paste a .env file directly
          - textbox "DATABASE_URL=postgres://localhost/myapp STRIPE_SECRET=sk_live_… SENTRY_DSN=https://…" [ref=e63]:
            - /placeholder: "DATABASE_URL=postgres://localhost/myapp\nSTRIPE_SECRET=sk_live_…\nSENTRY_DSN=https://…"
            - text: DATABASE_URL=postgres://localhost/myapp STRIPE_SECRET=sk_live_abc123 SENTRY_DSN=https://abc@sentry.io/1
          - paragraph [ref=e64]:
            - text: One KEY=VALUE per line. Lines without
            - code [ref=e65]: =
            - text: are skipped.
        - generic [ref=e66]:
          - text: Notes
          - textbox "Optional context" [ref=e67]
        - paragraph [ref=e69]: unauthorized
        - generic [ref=e70]:
          - generic [ref=e71]: AES-256-GCM · zero-knowledge
          - generic [ref=e72]:
            - button "Cancel" [ref=e73] [cursor=pointer]
            - button "Save secret" [ref=e74] [cursor=pointer]
    - complementary [ref=e75]:
      - generic [ref=e76]:
        - img [ref=e78]
        - generic [ref=e80]: KeyShield
      - navigation [ref=e81]:
        - button "Vault" [ref=e82] [cursor=pointer]:
          - img [ref=e83]
          - generic [ref=e87]: Vault
        - button "Activity" [ref=e88] [cursor=pointer]:
          - img [ref=e89]
          - generic [ref=e91]: Activity
        - button "Agents" [ref=e92] [cursor=pointer]:
          - img [ref=e93]
          - generic [ref=e96]: Agents
        - button "Sharing" [ref=e97] [cursor=pointer]:
          - img [ref=e98]
          - generic [ref=e104]: Sharing
        - button "Sessions" [ref=e105] [cursor=pointer]:
          - img [ref=e106]
          - generic [ref=e111]: Sessions
        - button "Settings" [ref=e112] [cursor=pointer]:
          - img [ref=e113]
          - generic [ref=e116]: Settings
        - button "Developer DEV" [ref=e117] [cursor=pointer]:
          - img [ref=e118]
          - generic [ref=e120]: Developer
          - generic [ref=e121]: DEV
        - button "Docs" [ref=e122] [cursor=pointer]:
          - img [ref=e123]
          - generic [ref=e125]: Docs
      - generic [ref=e127]:
        - generic [ref=e130]: Connected
        - button "—" [ref=e131] [cursor=pointer]:
          - generic [ref=e132]: —
          - img [ref=e133]
        - button "Disconnect" [ref=e136] [cursor=pointer]:
          - img [ref=e137]
          - text: Disconnect
    - main [ref=e140]:
      - generic [ref=e141]:
        - generic [ref=e142]:
          - heading "vault" [level=1] [ref=e143]
          - paragraph [ref=e144]: All your encrypted secrets
        - generic [ref=e145]:
          - generic "Backend healthy · 16ms · last check 0s ago" [ref=e146]:
            - generic [ref=e148]: API
          - button [ref=e149] [cursor=pointer]:
            - img [ref=e150]
          - button "New secret" [ref=e153] [cursor=pointer]:
            - img [ref=e154]
            - text: New secret
      - generic [ref=e157]:
        - generic [ref=e158]:
          - generic [ref=e159]:
            - generic [ref=e160]: Total secrets
            - generic [ref=e161]: "0"
            - generic [ref=e162]: encrypted with AES-256-GCM
          - generic [ref=e163]:
            - generic [ref=e164]: Used this week
            - generic [ref=e165]: "0"
            - generic [ref=e166]: across agents and apps
          - generic [ref=e167]:
            - generic [ref=e168]: Expiring soon
            - generic [ref=e169]: "0"
            - generic [ref=e170]: within 14 days
        - generic [ref=e171]:
          - img [ref=e173]
          - paragraph [ref=e177]: Your vault is empty
          - paragraph [ref=e178]: Add your first encrypted secret to get started.
          - button "Add a secret" [ref=e179] [cursor=pointer]:
            - img [ref=e180]
            - text: Add a secret
```

# Test source

```ts
  218 |     await apiKeyInput(page).fill('sk-ant-api03-test-anthropic-key');
  219 |     await page.getByRole('button', { name: 'Save secret' }).click();
  220 | 
  221 |     await expect(page.getByRole('heading', { name: 'Anthropic Claude' })).toBeVisible();
  222 |     await expect(page.getByText('anthropic.com')).toBeVisible();
  223 |   });
  224 | 
  225 |   test('save a Groq API key', async ({ page }) => {
  226 |     await installMockApi(page);
  227 |     await seedAuth(page);
  228 |     await page.goto('/');
  229 |     await openNewSecretModal(page);
  230 | 
  231 |     await page.locator('select').first().selectOption('groq');
  232 |     await apiKeyInput(page).fill('gsk_live_testgroqkey123456');
  233 |     await page.getByRole('button', { name: 'Save secret' }).click();
  234 | 
  235 |     await expect(page.getByRole('heading', { name: 'Groq' })).toBeVisible();
  236 |   });
  237 | 
  238 |   test('optional label overrides the provider name on the card', async ({ page }) => {
  239 |     await installMockApi(page);
  240 |     await seedAuth(page);
  241 |     await page.goto('/');
  242 |     await openNewSecretModal(page);
  243 | 
  244 |     // Give a custom label
  245 |     await page.locator('input[placeholder="e.g. Production API key"]').fill('My Production Key');
  246 |     await apiKeyInput(page).fill('sk-proj-prod-labeled-key');
  247 |     await page.getByRole('button', { name: 'Save secret' }).click();
  248 | 
  249 |     await expect(page.getByRole('heading', { name: 'My Production Key' })).toBeVisible();
  250 |   });
  251 | 
  252 |   test('save a password entry for GitHub', async ({ page }) => {
  253 |     await installMockApi(page);
  254 |     await seedAuth(page);
  255 |     await page.goto('/');
  256 |     await openNewSecretModal(page);
  257 | 
  258 |     // Switch to Password tab
  259 |     await page.getByRole('button', { name: 'Password' }).click();
  260 |     await expect(page.getByText('Username + password for any site')).toBeVisible();
  261 | 
  262 |     // Site name
  263 |     await page.locator('input[placeholder="e.g. GitHub"]').fill('GitHub');
  264 | 
  265 |     // Username + URL
  266 |     await page.locator('input[placeholder="alice@example.com"]').fill('alice@example.com');
  267 |     await page.locator('input[placeholder="https://github.com"]').fill('https://github.com');
  268 | 
  269 |     // Password
  270 |     await page.locator('label:has-text("Password")').locator('..').locator('input').fill('hunter2-super-secret!');
  271 | 
  272 |     await page.getByRole('button', { name: 'Save secret' }).click();
  273 | 
  274 |     await expect(page.getByRole('heading', { name: 'GitHub' })).toBeVisible();
  275 |     // Type badge shows "password"
  276 |     await expect(page.getByText('password').first()).toBeVisible();
  277 |   });
  278 | 
  279 |   test('save a secure note with recovery codes', async ({ page }) => {
  280 |     await installMockApi(page);
  281 |     await seedAuth(page);
  282 |     await page.goto('/');
  283 |     await openNewSecretModal(page);
  284 | 
  285 |     await page.getByRole('button', { name: 'Secure note' }).click();
  286 |     await expect(page.getByText('Encrypted text — recovery codes, secrets, etc.')).toBeVisible();
  287 | 
  288 |     // Title
  289 |     await page.locator('input[placeholder="e.g. Recovery codes"]').fill('AWS recovery codes');
  290 | 
  291 |     // Content
  292 |     await page.locator('label:has-text("Content")').locator('..').locator('textarea')
  293 |       .fill('1234-ABCD\n5678-EFGH\n9012-IJKL');
  294 | 
  295 |     await page.getByRole('button', { name: 'Save secret' }).click();
  296 | 
  297 |     await expect(page.getByRole('heading', { name: 'AWS recovery codes' })).toBeVisible();
  298 |   });
  299 | 
  300 |   test('save a .env file for a staging backend', async ({ page }) => {
  301 |     await installMockApi(page);
  302 |     await seedAuth(page);
  303 |     await page.goto('/');
  304 |     await openNewSecretModal(page);
  305 | 
  306 |     await page.getByRole('button', { name: '.env file' }).click();
  307 |     await expect(page.getByText('Block of KEY=VALUE pairs for an app')).toBeVisible();
  308 | 
  309 |     // Project name
  310 |     await page.locator('input[placeholder="e.g. backend-staging"]').fill('backend-staging');
  311 | 
  312 |     // Env vars (paste a whole .env file)
  313 |     await page.locator('label:has-text("Environment variables")').locator('..').locator('textarea')
  314 |       .fill('DATABASE_URL=postgres://localhost/myapp\nSTRIPE_SECRET=sk_live_abc123\nSENTRY_DSN=https://abc@sentry.io/1');
  315 | 
  316 |     await page.getByRole('button', { name: 'Save secret' }).click();
  317 | 
> 318 |     await expect(page.getByRole('heading', { name: 'backend-staging' })).toBeVisible();
      |                                                                          ^ Error: expect(locator).toBeVisible() failed
  319 |   });
  320 | 
  321 |   test('save an SSH key for production deploy access', async ({ page }) => {
  322 |     await installMockApi(page);
  323 |     await seedAuth(page);
  324 |     await page.goto('/');
  325 |     await openNewSecretModal(page);
  326 | 
  327 |     await page.getByRole('button', { name: 'SSH key' }).click();
  328 |     await expect(page.getByText('Public + private key + passphrase')).toBeVisible();
  329 | 
  330 |     // Key name
  331 |     await page.locator('input[placeholder="e.g. deploy-key"]').fill('prod-deploy');
  332 | 
  333 |     // Public key (optional)
  334 |     await page.locator('label:has-text("Public key (optional)")').locator('..').locator('textarea')
  335 |       .fill('ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA alice@laptop');
  336 | 
  337 |     // Private key (required)
  338 |     await page.locator('label:has-text("Private key")').locator('..').locator('textarea')
  339 |       .fill('-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\n-----END OPENSSH PRIVATE KEY-----');
  340 | 
  341 |     // Comment
  342 |     await page.locator('input[placeholder="alice@laptop"]').fill('alice@laptop');
  343 | 
  344 |     await page.getByRole('button', { name: 'Save secret' }).click();
  345 | 
  346 |     await expect(page.getByRole('heading', { name: 'prod-deploy' })).toBeVisible();
  347 |   });
  348 | });
  349 | 
  350 | // ═══════════════════════════════════════════════════════════════════════════════
  351 | //  3.  VALIDATION — modal blocks save on missing required fields
  352 | // ═══════════════════════════════════════════════════════════════════════════════
  353 | 
  354 | test.describe('validation errors', () => {
  355 |   test('API key tab — cannot save without pasting the key', async ({ page }) => {
  356 |     await installMockApi(page);
  357 |     await seedAuth(page);
  358 |     await page.goto('/');
  359 |     await openNewSecretModal(page);
  360 | 
  361 |     // No key entered — submit immediately
  362 |     await page.getByRole('button', { name: 'Save secret' }).click();
  363 | 
  364 |     await expect(page.getByText('Paste the API key')).toBeVisible();
  365 |     // Modal stays open
  366 |     await expect(page.getByRole('heading', { name: 'New secret' })).toBeVisible();
  367 |   });
  368 | 
  369 |   test('Password tab — cannot save without a password', async ({ page }) => {
  370 |     await installMockApi(page);
  371 |     await seedAuth(page);
  372 |     await page.goto('/');
  373 |     await openNewSecretModal(page);
  374 | 
  375 |     await page.getByRole('button', { name: 'Password' }).click();
  376 |     await page.locator('input[placeholder="e.g. GitHub"]').fill('MyApp');
  377 |     await page.locator('input[placeholder="alice@example.com"]').fill('alice@example.com');
  378 |     // password field intentionally left blank
  379 | 
  380 |     await page.getByRole('button', { name: 'Save secret' }).click();
  381 | 
  382 |     await expect(page.getByText('Password required')).toBeVisible();
  383 |     await expect(page.getByRole('heading', { name: 'New secret' })).toBeVisible();
  384 |   });
  385 | 
  386 |   test('Secure note tab — cannot save an empty note', async ({ page }) => {
  387 |     await installMockApi(page);
  388 |     await seedAuth(page);
  389 |     await page.goto('/');
  390 |     await openNewSecretModal(page);
  391 | 
  392 |     await page.getByRole('button', { name: 'Secure note' }).click();
  393 |     await page.locator('input[placeholder="e.g. Recovery codes"]').fill('Title only, no content');
  394 |     // content textarea left blank
  395 | 
  396 |     await page.getByRole('button', { name: 'Save secret' }).click();
  397 | 
  398 |     await expect(page.getByText('Write something in the note')).toBeVisible();
  399 |   });
  400 | 
  401 |   test('.env tab — cannot save without any KEY=VALUE pairs', async ({ page }) => {
  402 |     await installMockApi(page);
  403 |     await seedAuth(page);
  404 |     await page.goto('/');
  405 |     await openNewSecretModal(page);
  406 | 
  407 |     await page.getByRole('button', { name: '.env file' }).click();
  408 |     await page.locator('input[placeholder="e.g. backend-staging"]').fill('my-app');
  409 |     // env textarea left blank
  410 | 
  411 |     await page.getByRole('button', { name: 'Save secret' }).click();
  412 | 
  413 |     await expect(page.getByText('Paste at least one KEY=VALUE line')).toBeVisible();
  414 |   });
  415 | 
  416 |   test('SSH key tab — cannot save without a private key', async ({ page }) => {
  417 |     await installMockApi(page);
  418 |     await seedAuth(page);
```