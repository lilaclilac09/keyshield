# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: user-flows.spec.ts >> reveal and hide secrets >> secure note: Reveal button shows content, Hide now button hides it
- Location: tests/e2e/user-flows.spec.ts:540:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'Secret Plans' })
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByRole('heading', { name: 'Secret Plans' })

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
          - textbox "e.g. Recovery codes" [ref=e58]: Secret Plans
        - generic [ref=e59]:
          - text: Content
          - textbox "Recovery codes, license keys, anything you'd put in a sticky note but encrypted." [ref=e60]: World domination begins at 0800 UTC.
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
  506 |     await expect(page.getByRole('heading', { name: 'OpenAI' })).toBeVisible();
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
> 552 |     await expect(page.getByRole('heading', { name: 'Secret Plans' })).toBeVisible();
      |                                                                       ^ Error: expect(locator).toBeVisible() failed
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
  607 |     // First click: switches to the confirm state
  608 |     await page.getByTitle('Delete (click twice)').click();
  609 | 
  610 |     // Second click: confirms deletion
  611 |     await page.getByRole('button', { name: 'Confirm' }).click();
  612 | 
  613 |     await expect(page.getByRole('heading', { name: 'OpenAI' })).not.toBeVisible();
  614 |     await expect(page.getByText('Your vault is empty')).toBeVisible();
  615 |   });
  616 | 
  617 |   test('after adding two secrets, deleting one leaves the other', async ({ page }) => {
  618 |     await installMockApi(page);
  619 |     await seedAuth(page);
  620 |     await page.goto('/');
  621 | 
  622 |     // Add OpenAI key
  623 |     await openNewSecretModal(page);
  624 |     await apiKeyInput(page).fill('sk-proj-keep-me');
  625 |     await page.getByRole('button', { name: 'Save secret' }).click();
  626 |     await expect(page.getByRole('heading', { name: 'OpenAI' })).toBeVisible();
  627 | 
  628 |     // Add Anthropic key
  629 |     await openNewSecretModal(page);
  630 |     await page.locator('select').first().selectOption('anthropic');
  631 |     await apiKeyInput(page).fill('sk-ant-delete-me');
  632 |     await page.getByRole('button', { name: 'Save secret' }).click();
  633 |     await expect(page.getByRole('heading', { name: 'Anthropic Claude' })).toBeVisible();
  634 | 
  635 |     // Delete Anthropic
  636 |     const anthropicCard = page.locator('[class*="group rounded-xl"]').filter({ hasText: 'Anthropic Claude' });
  637 |     await anthropicCard.hover();
  638 |     await anthropicCard.getByTitle('Delete (click twice)').click();
  639 |     await page.getByRole('button', { name: 'Confirm' }).click();
  640 | 
  641 |     await expect(page.getByRole('heading', { name: 'Anthropic Claude' })).not.toBeVisible();
  642 |     await expect(page.getByRole('heading', { name: 'OpenAI' })).toBeVisible(); // still there
  643 |   });
  644 | });
  645 | 
  646 | // ═══════════════════════════════════════════════════════════════════════════════
  647 | //  7.  SEARCH / FILTER
  648 | // ═══════════════════════════════════════════════════════════════════════════════
  649 | 
  650 | test.describe('search vault', () => {
  651 |   test('searching filters vault cards by name', async ({ page }) => {
  652 |     await installMockApi(page);
```