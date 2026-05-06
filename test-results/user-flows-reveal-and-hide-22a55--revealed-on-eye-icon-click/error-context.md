# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: user-flows.spec.ts >> reveal and hide secrets >> API key is masked by default and revealed on eye-icon click
- Location: tests/e2e/user-flows.spec.ts:498:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'OpenAI' })
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByRole('heading', { name: 'OpenAI' })

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
          - paragraph [ref=e24]: OpenAI, Anthropic, Helius… proxied with zero-trust
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
          - generic [ref=e58]: Label(optional)
          - textbox "e.g. Production API key" [ref=e59]
        - generic [ref=e60]:
          - generic [ref=e61]:
            - text: Provider
            - combobox [ref=e62] [cursor=pointer]:
              - option "OpenAI" [selected]
              - option "Anthropic Claude"
              - option "Helius RPC"
              - option "Mistral AI"
              - option "Cohere"
              - option "Groq"
          - generic [ref=e63]:
            - text: Expires
            - textbox [ref=e64]: 2026-08-03
        - generic [ref=e65]:
          - text: API key
          - generic [ref=e66]:
            - textbox "sk-proj-…" [ref=e67]: sk-proj-reveal-me-abcdef123456
            - button [ref=e68] [cursor=pointer]:
              - img [ref=e69]
        - generic [ref=e72]:
          - text: Notes
          - textbox "Optional context" [ref=e73]
        - paragraph [ref=e75]: unauthorized
        - generic [ref=e76]:
          - generic [ref=e77]: AES-256-GCM · zero-knowledge
          - generic [ref=e78]:
            - button "Cancel" [ref=e79] [cursor=pointer]
            - button "Save secret" [ref=e80] [cursor=pointer]
    - complementary [ref=e81]:
      - generic [ref=e82]:
        - img [ref=e84]
        - generic [ref=e86]: KeyShield
      - navigation [ref=e87]:
        - button "Vault" [ref=e88] [cursor=pointer]:
          - img [ref=e89]
          - generic [ref=e93]: Vault
        - button "Activity" [ref=e94] [cursor=pointer]:
          - img [ref=e95]
          - generic [ref=e97]: Activity
        - button "Agents" [ref=e98] [cursor=pointer]:
          - img [ref=e99]
          - generic [ref=e102]: Agents
        - button "Sharing" [ref=e103] [cursor=pointer]:
          - img [ref=e104]
          - generic [ref=e110]: Sharing
        - button "Sessions" [ref=e111] [cursor=pointer]:
          - img [ref=e112]
          - generic [ref=e117]: Sessions
        - button "Settings" [ref=e118] [cursor=pointer]:
          - img [ref=e119]
          - generic [ref=e122]: Settings
        - button "Developer DEV" [ref=e123] [cursor=pointer]:
          - img [ref=e124]
          - generic [ref=e126]: Developer
          - generic [ref=e127]: DEV
        - button "Docs" [ref=e128] [cursor=pointer]:
          - img [ref=e129]
          - generic [ref=e131]: Docs
      - generic [ref=e133]:
        - generic [ref=e136]: Connected
        - button "—" [ref=e137] [cursor=pointer]:
          - generic [ref=e138]: —
          - img [ref=e139]
        - button "Disconnect" [ref=e142] [cursor=pointer]:
          - img [ref=e143]
          - text: Disconnect
    - main [ref=e146]:
      - generic [ref=e147]:
        - generic [ref=e148]:
          - heading "vault" [level=1] [ref=e149]
          - paragraph [ref=e150]: All your encrypted secrets
        - generic [ref=e151]:
          - generic "Backend healthy · 17ms · last check 0s ago" [ref=e152]:
            - generic [ref=e154]: API
          - button [ref=e155] [cursor=pointer]:
            - img [ref=e156]
          - button "New secret" [ref=e159] [cursor=pointer]:
            - img [ref=e160]
            - text: New secret
      - generic [ref=e163]:
        - generic [ref=e164]:
          - generic [ref=e165]:
            - generic [ref=e166]: Total secrets
            - generic [ref=e167]: "0"
            - generic [ref=e168]: encrypted with AES-256-GCM
          - generic [ref=e169]:
            - generic [ref=e170]: Used this week
            - generic [ref=e171]: "0"
            - generic [ref=e172]: across agents and apps
          - generic [ref=e173]:
            - generic [ref=e174]: Expiring soon
            - generic [ref=e175]: "0"
            - generic [ref=e176]: within 14 days
        - generic [ref=e177]:
          - img [ref=e179]
          - paragraph [ref=e183]: Your vault is empty
          - paragraph [ref=e184]: Add your first encrypted secret to get started.
          - button "Add a secret" [ref=e185] [cursor=pointer]:
            - img [ref=e186]
            - text: Add a secret
```

# Test source

```ts
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
  419 |     await page.goto('/');
  420 |     await openNewSecretModal(page);
  421 | 
  422 |     await page.getByRole('button', { name: 'SSH key' }).click();
  423 |     await page.locator('input[placeholder="e.g. deploy-key"]').fill('my-key');
  424 |     // private key textarea left blank
  425 | 
  426 |     await page.getByRole('button', { name: 'Save secret' }).click();
  427 | 
  428 |     await expect(page.getByText('Private key required')).toBeVisible();
  429 |   });
  430 | 
  431 |   test('switching type tab clears the previous error', async ({ page }) => {
  432 |     await installMockApi(page);
  433 |     await seedAuth(page);
  434 |     await page.goto('/');
  435 |     await openNewSecretModal(page);
  436 | 
  437 |     // Trigger API key error
  438 |     await page.getByRole('button', { name: 'Save secret' }).click();
  439 |     await expect(page.getByText('Paste the API key')).toBeVisible();
  440 | 
  441 |     // Switching tab clears the banner
  442 |     await page.getByRole('button', { name: 'Password' }).click();
  443 |     await expect(page.getByText('Paste the API key')).not.toBeVisible();
  444 |   });
  445 | });
  446 | 
  447 | // ═══════════════════════════════════════════════════════════════════════════════
  448 | //  4.  MODAL DISMISS — cancel, X button, backdrop click
  449 | // ═══════════════════════════════════════════════════════════════════════════════
  450 | 
  451 | test.describe('modal dismiss', () => {
  452 |   test('Cancel button closes the modal without saving', async ({ page }) => {
  453 |     await installMockApi(page);
  454 |     await seedAuth(page);
  455 |     await page.goto('/');
  456 |     await openNewSecretModal(page);
  457 | 
  458 |     // Start filling a key
  459 |     await apiKeyInput(page).fill('sk-proj-will-be-cancelled');
  460 | 
  461 |     await page.getByRole('button', { name: 'Cancel' }).click();
  462 | 
  463 |     await expect(page.getByRole('heading', { name: 'New secret' })).not.toBeVisible();
  464 |     await expect(page.getByText('Your vault is empty')).toBeVisible(); // nothing saved
  465 |   });
  466 | 
  467 |   test('X icon button in the modal header closes the modal', async ({ page }) => {
  468 |     await installMockApi(page);
  469 |     await seedAuth(page);
  470 |     await page.goto('/');
  471 |     await openNewSecretModal(page);
  472 | 
  473 |     // Click the × (Lucide X icon) inside the modal
  474 |     await page.locator('[class*="max-w-2xl"] button:has(svg.lucide-x)').click();
  475 | 
  476 |     await expect(page.getByRole('heading', { name: 'New secret' })).not.toBeVisible();
  477 |     await expect(page.getByText('Your vault is empty')).toBeVisible();
  478 |   });
  479 | 
  480 |   test('clicking the backdrop (outside the modal) closes it', async ({ page }) => {
  481 |     await installMockApi(page);
  482 |     await seedAuth(page);
  483 |     await page.goto('/');
  484 |     await openNewSecretModal(page);
  485 | 
  486 |     // Click the translucent backdrop behind the modal
  487 |     await page.locator('div[class*="backdrop-blur-sm"]').click({ force: true });
  488 | 
  489 |     await expect(page.getByRole('heading', { name: 'New secret' })).not.toBeVisible();
  490 |   });
  491 | });
  492 | 
  493 | // ═══════════════════════════════════════════════════════════════════════════════
  494 | //  5.  REVEAL, COPY & HIDE SECRETS
  495 | // ═══════════════════════════════════════════════════════════════════════════════
  496 | 
  497 | test.describe('reveal and hide secrets', () => {
  498 |   test('API key is masked by default and revealed on eye-icon click', async ({ page }) => {
  499 |     await installMockApi(page);
  500 |     await seedAuth(page);
  501 |     await page.goto('/');
  502 |     await openNewSecretModal(page);
  503 | 
  504 |     await apiKeyInput(page).fill('sk-proj-reveal-me-abcdef123456');
  505 |     await page.getByRole('button', { name: 'Save secret' }).click();
> 506 |     await expect(page.getByRole('heading', { name: 'OpenAI' })).toBeVisible();
      |                                                                 ^ Error: expect(locator).toBeVisible() failed
  507 | 
  508 |     // Key is masked before reveal
  509 |     await expect(page.getByText('••••••••••••••••••••••••')).toBeVisible();
  510 | 
  511 |     // Click the eye icon to reveal
  512 |     await page.getByTitle('Reveal').click();
  513 | 
  514 |     // The actual key appears in the code block
  515 |     await expect(page.getByText('sk-proj-reveal-me-abcdef123456')).toBeVisible();
  516 | 
  517 |     // Auto-hide countdown is shown
  518 |     await expect(page.getByText(/hides in \d+s/)).toBeVisible();
  519 |   });
  520 | 
  521 |   test('clicking the eye icon again hides the key', async ({ page }) => {
  522 |     await installMockApi(page);
  523 |     await seedAuth(page);
  524 |     await page.goto('/');
  525 |     await openNewSecretModal(page);
  526 | 
  527 |     await apiKeyInput(page).fill('sk-proj-hide-me-9876543210');
  528 |     await page.getByRole('button', { name: 'Save secret' }).click();
  529 | 
  530 |     await page.getByTitle('Reveal').click();
  531 |     await expect(page.getByText('sk-proj-hide-me-9876543210')).toBeVisible();
  532 | 
  533 |     await page.getByTitle('Hide').click();
  534 | 
  535 |     // Key is masked again, timer gone
  536 |     await expect(page.getByText('••••••••••••••••••••••••')).toBeVisible();
  537 |     await expect(page.getByText('sk-proj-hide-me-9876543210')).not.toBeVisible();
  538 |   });
  539 | 
  540 |   test('secure note: Reveal button shows content, Hide now button hides it', async ({ page }) => {
  541 |     await installMockApi(page);
  542 |     await seedAuth(page);
  543 |     await page.goto('/');
  544 |     await openNewSecretModal(page);
  545 | 
  546 |     await page.getByRole('button', { name: 'Secure note' }).click();
  547 |     await page.locator('input[placeholder="e.g. Recovery codes"]').fill('Secret Plans');
  548 |     await page.locator('label:has-text("Content")').locator('..').locator('textarea')
  549 |       .fill('World domination begins at 0800 UTC.');
  550 |     await page.getByRole('button', { name: 'Save secret' }).click();
  551 | 
  552 |     await expect(page.getByRole('heading', { name: 'Secret Plans' })).toBeVisible();
  553 | 
  554 |     // Full-width Reveal button for non-API-key types
  555 |     await page.getByRole('button', { name: 'Reveal' }).click();
  556 | 
  557 |     await expect(page.getByText('World domination begins at 0800 UTC.')).toBeVisible();
  558 |     await expect(page.getByText(/REVEALED · hides in \d+s/)).toBeVisible();
  559 | 
  560 |     // "Hide now" link collapses the note
  561 |     await page.getByRole('button', { name: 'Hide now' }).click();
  562 | 
  563 |     await expect(page.getByText('World domination begins at 0800 UTC.')).not.toBeVisible();
  564 |     await expect(page.getByRole('button', { name: 'Reveal' })).toBeVisible();
  565 |   });
  566 | 
  567 |   test('.env reveal shows each KEY=VALUE pair', async ({ page }) => {
  568 |     await installMockApi(page);
  569 |     await seedAuth(page);
  570 |     await page.goto('/');
  571 |     await openNewSecretModal(page);
  572 | 
  573 |     await page.getByRole('button', { name: '.env file' }).click();
  574 |     await page.locator('input[placeholder="e.g. backend-staging"]').fill('prod-env');
  575 |     await page.locator('label:has-text("Environment variables")').locator('..').locator('textarea')
  576 |       .fill('API_TOKEN=secret-token-xyz\nDB_PASS=hunter2');
  577 |     await page.getByRole('button', { name: 'Save secret' }).click();
  578 | 
  579 |     await expect(page.getByRole('heading', { name: 'prod-env' })).toBeVisible();
  580 | 
  581 |     await page.getByRole('button', { name: 'Reveal' }).click();
  582 | 
  583 |     await expect(page.getByText('API_TOKEN=secret-token-xyz')).toBeVisible();
  584 |     await expect(page.getByText('DB_PASS=hunter2')).toBeVisible();
  585 |   });
  586 | });
  587 | 
  588 | // ═══════════════════════════════════════════════════════════════════════════════
  589 | //  6.  DELETE A SECRET
  590 | // ═══════════════════════════════════════════════════════════════════════════════
  591 | 
  592 | test.describe('delete secrets', () => {
  593 |   test('deleting a secret requires two clicks (confirm gate)', async ({ page }) => {
  594 |     await installMockApi(page);
  595 |     await seedAuth(page);
  596 |     await page.goto('/');
  597 |     await openNewSecretModal(page);
  598 | 
  599 |     await apiKeyInput(page).fill('sk-proj-delete-me');
  600 |     await page.getByRole('button', { name: 'Save secret' }).click();
  601 |     await expect(page.getByRole('heading', { name: 'OpenAI' })).toBeVisible();
  602 | 
  603 |     // The trash button is opacity-0 until hovered
  604 |     const card = page.locator('[class*="group rounded-xl"]').filter({ hasText: 'OpenAI' });
  605 |     await card.hover();
  606 | 
```