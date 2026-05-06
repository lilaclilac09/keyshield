# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: user-flows.spec.ts >> add secrets — all types >> save a secure note with recovery codes
- Location: tests/e2e/user-flows.spec.ts:279:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'AWS recovery codes' })
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByRole('heading', { name: 'AWS recovery codes' })

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
          - paragraph [ref=e24]: Encrypted text — recovery codes, secrets, etc.
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
          - text: Title
          - textbox "e.g. Recovery codes" [ref=e58]: AWS recovery codes
        - generic [ref=e59]:
          - text: Content
          - textbox "Recovery codes, license keys, anything you'd put in a sticky note but encrypted." [ref=e60]: 1234-ABCD 5678-EFGH 9012-IJKL
        - paragraph [ref=e62]: unauthorized
        - generic [ref=e63]:
          - generic [ref=e64]: AES-256-GCM · zero-knowledge
          - generic [ref=e65]:
            - button "Cancel" [ref=e66] [cursor=pointer]
            - button "Save secret" [ref=e67] [cursor=pointer]
    - complementary [ref=e68]:
      - generic [ref=e69]:
        - img [ref=e71]
        - generic [ref=e73]: KeyShield
      - navigation [ref=e74]:
        - button "Vault" [ref=e75] [cursor=pointer]:
          - img [ref=e76]
          - generic [ref=e80]: Vault
        - button "Activity" [ref=e81] [cursor=pointer]:
          - img [ref=e82]
          - generic [ref=e84]: Activity
        - button "Agents" [ref=e85] [cursor=pointer]:
          - img [ref=e86]
          - generic [ref=e89]: Agents
        - button "Sharing" [ref=e90] [cursor=pointer]:
          - img [ref=e91]
          - generic [ref=e97]: Sharing
        - button "Sessions" [ref=e98] [cursor=pointer]:
          - img [ref=e99]
          - generic [ref=e104]: Sessions
        - button "Settings" [ref=e105] [cursor=pointer]:
          - img [ref=e106]
          - generic [ref=e109]: Settings
        - button "Developer DEV" [ref=e110] [cursor=pointer]:
          - img [ref=e111]
          - generic [ref=e113]: Developer
          - generic [ref=e114]: DEV
        - button "Docs" [ref=e115] [cursor=pointer]:
          - img [ref=e116]
          - generic [ref=e118]: Docs
      - generic [ref=e120]:
        - generic [ref=e123]: Connected
        - button "—" [ref=e124] [cursor=pointer]:
          - generic [ref=e125]: —
          - img [ref=e126]
        - button "Disconnect" [ref=e129] [cursor=pointer]:
          - img [ref=e130]
          - text: Disconnect
    - main [ref=e133]:
      - generic [ref=e134]:
        - generic [ref=e135]:
          - heading "vault" [level=1] [ref=e136]
          - paragraph [ref=e137]: All your encrypted secrets
        - generic [ref=e138]:
          - generic "Backend healthy · 17ms · last check 0s ago" [ref=e139]:
            - generic [ref=e141]: API
          - button [ref=e142] [cursor=pointer]:
            - img [ref=e143]
          - button "New secret" [ref=e146] [cursor=pointer]:
            - img [ref=e147]
            - text: New secret
      - generic [ref=e150]:
        - generic [ref=e151]:
          - generic [ref=e152]:
            - generic [ref=e153]: Total secrets
            - generic [ref=e154]: "0"
            - generic [ref=e155]: encrypted with AES-256-GCM
          - generic [ref=e156]:
            - generic [ref=e157]: Used this week
            - generic [ref=e158]: "0"
            - generic [ref=e159]: across agents and apps
          - generic [ref=e160]:
            - generic [ref=e161]: Expiring soon
            - generic [ref=e162]: "0"
            - generic [ref=e163]: within 14 days
        - generic [ref=e164]:
          - img [ref=e166]
          - paragraph [ref=e170]: Your vault is empty
          - paragraph [ref=e171]: Add your first encrypted secret to get started.
          - button "Add a secret" [ref=e172] [cursor=pointer]:
            - img [ref=e173]
            - text: Add a secret
```

# Test source

```ts
  197 |     await openNewSecretModal(page);
  198 | 
  199 |     // Provider defaults to OpenAI
  200 |     await expect(page.locator('select').first()).toHaveValue('openai');
  201 | 
  202 |     await apiKeyInput(page).fill('sk-proj-testkey-1234567890abcdef');
  203 |     await page.getByRole('button', { name: 'Save secret' }).click();
  204 | 
  205 |     // Card appears, modal closes
  206 |     await expect(page.getByRole('heading', { name: 'New secret' })).not.toBeVisible();
  207 |     await expect(page.getByRole('heading', { name: 'OpenAI' })).toBeVisible();
  208 |     await expect(page.getByText('openai.com')).toBeVisible();
  209 |   });
  210 | 
  211 |   test('switch provider to Anthropic before saving', async ({ page }) => {
  212 |     await installMockApi(page);
  213 |     await seedAuth(page);
  214 |     await page.goto('/');
  215 |     await openNewSecretModal(page);
  216 | 
  217 |     await page.locator('select').first().selectOption('anthropic');
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
> 297 |     await expect(page.getByRole('heading', { name: 'AWS recovery codes' })).toBeVisible();
      |                                                                             ^ Error: expect(locator).toBeVisible() failed
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
  318 |     await expect(page.getByRole('heading', { name: 'backend-staging' })).toBeVisible();
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
```