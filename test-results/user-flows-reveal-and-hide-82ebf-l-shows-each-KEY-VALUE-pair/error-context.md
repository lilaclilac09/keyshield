# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: user-flows.spec.ts >> reveal and hide secrets >> .env reveal shows each KEY=VALUE pair
- Location: tests/e2e/user-flows.spec.ts:567:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'prod-env' })
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByRole('heading', { name: 'prod-env' })

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
          - textbox "e.g. backend-staging" [ref=e58]: prod-env
        - generic [ref=e59]:
          - generic [ref=e60]:
            - generic [ref=e61]: Environment variables
            - generic [ref=e62]: paste a .env file directly
          - textbox "DATABASE_URL=postgres://localhost/myapp STRIPE_SECRET=sk_live_… SENTRY_DSN=https://…" [ref=e63]:
            - /placeholder: "DATABASE_URL=postgres://localhost/myapp\nSTRIPE_SECRET=sk_live_…\nSENTRY_DSN=https://…"
            - text: API_TOKEN=secret-token-xyz DB_PASS=hunter2
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
          - generic "Backend healthy · 17ms · last check 0s ago" [ref=e146]:
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
> 579 |     await expect(page.getByRole('heading', { name: 'prod-env' })).toBeVisible();
      |                                                                   ^ Error: expect(locator).toBeVisible() failed
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
  653 |     await seedAuth(page);
  654 |     await page.goto('/');
  655 | 
  656 |     // Add OpenAI key
  657 |     await openNewSecretModal(page);
  658 |     await apiKeyInput(page).fill('sk-proj-openai-one');
  659 |     await page.getByRole('button', { name: 'Save secret' }).click();
  660 |     await expect(page.getByRole('heading', { name: 'OpenAI' })).toBeVisible();
  661 | 
  662 |     // Add Anthropic key
  663 |     await openNewSecretModal(page);
  664 |     await page.locator('select').first().selectOption('anthropic');
  665 |     await apiKeyInput(page).fill('sk-ant-api03-two');
  666 |     await page.getByRole('button', { name: 'Save secret' }).click();
  667 |     await expect(page.getByRole('heading', { name: 'Anthropic Claude' })).toBeVisible();
  668 | 
  669 |     // Open search overlay with the search icon button (w-10 h-10 in header)
  670 |     await page.locator('header button:has(svg.lucide-search)').click();
  671 |     await expect(page.getByPlaceholder('Search your vault…')).toBeVisible();
  672 | 
  673 |     await page.getByPlaceholder('Search your vault…').fill('anthropic');
  674 | 
  675 |     // Close overlay with Escape to see the filtered grid
  676 |     await page.keyboard.press('Escape');
  677 | 
  678 |     await expect(page.getByRole('heading', { name: 'Anthropic Claude' })).toBeVisible();
  679 |     await expect(page.getByRole('heading', { name: 'OpenAI' })).not.toBeVisible();
```