# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: user-flows.spec.ts >> agents >> Agents section starts with an empty list and explains the 3-step flow
- Location: tests/e2e/user-flows.spec.ts:781:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Step 1')
Expected: visible
Error: strict mode violation: getByText('Step 1') resolved to 2 elements:
    1) <div class="text-[10px] text-[#5b8cff] font-mono mb-1">Step 1</div> aka getByText('Step 1', { exact: true })
    2) <span class="text-[11px] text-zinc-500 uppercase tracking-wider">Step 1 — generate keypair</span> aka getByText('Step 1 — generate keypair')

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByText('Step 1')

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
    - complementary [ref=e18]:
      - generic [ref=e19]:
        - img [ref=e21]
        - generic [ref=e23]: KeyShield
      - navigation [ref=e24]:
        - button "Vault" [ref=e25] [cursor=pointer]:
          - img [ref=e26]
          - generic [ref=e30]: Vault
        - button "Activity" [ref=e31] [cursor=pointer]:
          - img [ref=e32]
          - generic [ref=e34]: Activity
        - button "Agents" [active] [ref=e35] [cursor=pointer]:
          - img [ref=e36]
          - generic [ref=e39]: Agents
        - button "Sharing" [ref=e40] [cursor=pointer]:
          - img [ref=e41]
          - generic [ref=e47]: Sharing
        - button "Sessions" [ref=e48] [cursor=pointer]:
          - img [ref=e49]
          - generic [ref=e54]: Sessions
        - button "Settings" [ref=e55] [cursor=pointer]:
          - img [ref=e56]
          - generic [ref=e59]: Settings
        - button "Developer DEV" [ref=e60] [cursor=pointer]:
          - img [ref=e61]
          - generic [ref=e63]: Developer
          - generic [ref=e64]: DEV
        - button "Docs" [ref=e65] [cursor=pointer]:
          - img [ref=e66]
          - generic [ref=e68]: Docs
      - generic [ref=e70]:
        - generic [ref=e73]: Connected
        - button "—" [ref=e74] [cursor=pointer]:
          - generic [ref=e75]: —
          - img [ref=e76]
        - button "Disconnect" [ref=e79] [cursor=pointer]:
          - img [ref=e80]
          - text: Disconnect
    - main [ref=e83]:
      - generic [ref=e84]:
        - generic [ref=e85]:
          - heading "agents" [level=1] [ref=e86]
          - paragraph [ref=e87]: Agents you've granted scoped access to
        - generic [ref=e88]:
          - generic "Backend healthy · 17ms · last check 0s ago" [ref=e89]:
            - generic [ref=e91]: API
          - button [ref=e92] [cursor=pointer]:
            - img [ref=e93]
      - generic [ref=e98]:
        - generic [ref=e99]:
          - heading "Agent authentication" [level=3] [ref=e100]:
            - img [ref=e101]
            - text: Agent authentication
          - paragraph [ref=e104]: Agents authenticate with their own ed25519 keypair — no browser, no wallet extension, no human. Register the agent's public key here once. The agent signs a server challenge on each run and gets a vault token linked to your wallet.
          - generic [ref=e105]:
            - generic [ref=e106]:
              - generic [ref=e107]: Step 1
              - generic [ref=e108]: Generate keypair
              - generic [ref=e109]: Agent generates an ed25519 key. Private key stays in env vars — never committed.
            - generic [ref=e110]:
              - generic [ref=e111]: Step 2
              - generic [ref=e112]: Register pubkey
              - generic [ref=e113]: Owner registers the public key here. One-time setup, takes 5 seconds.
            - generic [ref=e114]:
              - generic [ref=e115]: Step 3
              - generic [ref=e116]: Agent self-authenticates
              - generic [ref=e117]: On each run, agent calls /auth/agent-login, signs a nonce, gets a vault token.
        - generic [ref=e118]:
          - generic [ref=e119]:
            - heading "Registered agents" [level=3] [ref=e120]
            - button [ref=e121] [cursor=pointer]:
              - img [ref=e122]
          - generic [ref=e127]:
            - paragraph [ref=e128]: No agents registered yet
            - paragraph [ref=e129]: Generate a keypair below and register your first agent
        - generic [ref=e130]:
          - heading "Register a new agent" [level=3] [ref=e131]
          - generic [ref=e133]:
            - generic [ref=e134]: Step 1 — generate keypair
            - button "Generate" [ref=e135] [cursor=pointer]:
              - img [ref=e136]
              - text: Generate
          - generic [ref=e138]:
            - text: Step 2 — register
            - textbox "Agent name (e.g. trading-bot-v1)" [ref=e139]
            - textbox "Agent public key (base58)" [ref=e140]
            - generic [ref=e141]:
              - combobox [ref=e142]:
                - option "All scopes (*)" [selected]
                - option "Proxy only"
                - option "Proxy + read vault"
              - button "Register" [disabled] [ref=e143]:
                - img [ref=e144]
                - text: Register
          - generic [ref=e145]:
            - text: Step 3 — agent code
            - generic [ref=e146]:
              - button "Copy" [ref=e147] [cursor=pointer]:
                - img [ref=e148]
                - text: Copy
              - generic [ref=e151]: "from keyshield_sdk import AgentKeyShield import os agent = AgentKeyShield( owner_wallet = os.getenv(\"KS_OWNER_WALLET\"), private_key_hex = os.getenv(\"KS_AGENT_KEY\"), vault_passphrase = os.getenv(\"KS_VAULT_PASS\"), ) # authenticate is automatic on first call client = agent.openai_client() resp = client.chat.completions.create( model=\"gpt-4o-mini\", messages=[{\"role\": \"user\", \"content\": \"analyze market\"}], ) print(resp.choices[0].message.content)"
```

# Test source

```ts
  688 |     await apiKeyInput(page).fill('sk-proj-one');
  689 |     await page.getByRole('button', { name: 'Save secret' }).click();
  690 | 
  691 |     await page.locator('header button:has(svg.lucide-search)').click();
  692 |     await page.getByPlaceholder('Search your vault…').fill('zzz-no-match-xyz');
  693 |     await page.keyboard.press('Escape');
  694 | 
  695 |     await expect(page.getByText('No secrets match your search.')).toBeVisible();
  696 |   });
  697 | 
  698 |   test('clearing the search restores all cards', async ({ page }) => {
  699 |     await installMockApi(page);
  700 |     await seedAuth(page);
  701 |     await page.goto('/');
  702 | 
  703 |     await openNewSecretModal(page);
  704 |     await apiKeyInput(page).fill('sk-proj-openai-restore');
  705 |     await page.getByRole('button', { name: 'Save secret' }).click();
  706 | 
  707 |     // Filter
  708 |     await page.locator('header button:has(svg.lucide-search)').click();
  709 |     await page.getByPlaceholder('Search your vault…').fill('zzz-no-match');
  710 |     await page.keyboard.press('Escape');
  711 |     await expect(page.getByText('No secrets match your search.')).toBeVisible();
  712 | 
  713 |     // Clear filter
  714 |     await page.locator('header button:has(svg.lucide-search)').click();
  715 |     await page.getByPlaceholder('Search your vault…').clear();
  716 |     await page.keyboard.press('Escape');
  717 | 
  718 |     await expect(page.getByRole('heading', { name: 'OpenAI' })).toBeVisible();
  719 |   });
  720 | });
  721 | 
  722 | // ═══════════════════════════════════════════════════════════════════════════════
  723 | //  8.  SIDEBAR NAVIGATION
  724 | // ═══════════════════════════════════════════════════════════════════════════════
  725 | 
  726 | test.describe('navigation', () => {
  727 |   test('user clicks through all eight sidebar sections', async ({ page }) => {
  728 |     await installMockApi(page);
  729 |     await seedAuth(page);
  730 |     await page.goto('/');
  731 | 
  732 |     const sections: Array<[string, string]> = [
  733 |       ['Activity',  'Recent reads, writes, and shares'],
  734 |       ['Agents',    "Agents you've granted scoped access to"],
  735 |       ['Sharing',   'Secrets shared with teammates'],
  736 |       ['Sessions',  'Active sessions across devices'],
  737 |       ['Settings',  'Account, security, and preferences'],
  738 |       ['Developer', 'API token, CLI commands, SDK snippets'],
  739 |       ['Docs',      'Quickstart, agent setup, and full reference'],
  740 |     ];
  741 | 
  742 |     for (const [navLabel, subtitle] of sections) {
  743 |       await page.getByRole('button', { name: navLabel }).click();
  744 |       await expect(page.getByText(subtitle)).toBeVisible();
  745 |     }
  746 | 
  747 |     // Back to Vault
  748 |     await page.getByRole('button', { name: 'Vault' }).click();
  749 |     await expect(page.getByText('All your encrypted secrets')).toBeVisible();
  750 |   });
  751 | 
  752 |   test('"New secret" button only appears in the Vault section', async ({ page }) => {
  753 |     await installMockApi(page);
  754 |     await seedAuth(page);
  755 |     await page.goto('/');
  756 | 
  757 |     await expect(page.getByRole('button', { name: 'New secret' })).toBeVisible();
  758 | 
  759 |     await page.getByRole('button', { name: 'Activity' }).click();
  760 |     await expect(page.getByRole('button', { name: 'New secret' })).not.toBeVisible();
  761 | 
  762 |     await page.getByRole('button', { name: 'Vault' }).click();
  763 |     await expect(page.getByRole('button', { name: 'New secret' })).toBeVisible();
  764 |   });
  765 | 
  766 |   test('Developer section has a DEV badge in the sidebar', async ({ page }) => {
  767 |     await installMockApi(page);
  768 |     await seedAuth(page);
  769 |     await page.goto('/');
  770 | 
  771 |     // DEV badge is always visible in the nav
  772 |     await expect(page.getByText('DEV')).toBeVisible();
  773 |   });
  774 | });
  775 | 
  776 | // ═══════════════════════════════════════════════════════════════════════════════
  777 | //  9.  AGENT MANAGEMENT
  778 | // ═══════════════════════════════════════════════════════════════════════════════
  779 | 
  780 | test.describe('agents', () => {
  781 |   test('Agents section starts with an empty list and explains the 3-step flow', async ({ page }) => {
  782 |     await installMockApi(page);
  783 |     await seedAuth(page);
  784 |     await page.goto('/');
  785 |     await page.getByRole('button', { name: 'Agents' }).click();
  786 | 
  787 |     await expect(page.getByText('No agents registered yet')).toBeVisible();
> 788 |     await expect(page.getByText('Step 1')).toBeVisible();
      |                                            ^ Error: expect(locator).toBeVisible() failed
  789 |     await expect(page.getByText('Step 2')).toBeVisible();
  790 |     await expect(page.getByText('Step 3')).toBeVisible();
  791 |   });
  792 | 
  793 |   test('Register button is disabled until both name and pubkey are filled', async ({ page }) => {
  794 |     await installMockApi(page);
  795 |     await seedAuth(page);
  796 |     await page.goto('/');
  797 |     await page.getByRole('button', { name: 'Agents' }).click();
  798 | 
  799 |     const registerBtn = page.getByRole('button', { name: 'Register' });
  800 |     await expect(registerBtn).toBeDisabled();
  801 | 
  802 |     await page.getByPlaceholder('Agent name (e.g. trading-bot-v1)').fill('my-agent');
  803 |     await expect(registerBtn).toBeDisabled(); // still missing pubkey
  804 | 
  805 |     await page.getByPlaceholder('Agent public key (base58)').fill('4s3Yk1NyFQKkCqW2GMk1mN6S8Uh8x5X2MZf8xdUzG2pR');
  806 |     await expect(registerBtn).toBeEnabled();
  807 |   });
  808 | 
  809 |   test('user generates a keypair — private key is shown, pubkey auto-fills the input', async ({ page }) => {
  810 |     await installMockApi(page);
  811 |     await seedAuth(page);
  812 |     await page.goto('/');
  813 |     await page.getByRole('button', { name: 'Agents' }).click();
  814 | 
  815 |     await page.getByRole('button', { name: 'Generate' }).click();
  816 | 
  817 |     // Security warning shown
  818 |     await expect(page.getByText("Save the private key NOW — it won't be shown again")).toBeVisible();
  819 | 
  820 |     // Generated pubkey auto-filled the input
  821 |     const pubkeyInput = page.getByPlaceholder('Agent public key (base58)');
  822 |     const pubkeyValue = await pubkeyInput.inputValue();
  823 |     expect(pubkeyValue.length).toBeGreaterThan(20);
  824 | 
  825 |     // Private key panel is visible
  826 |     await expect(page.getByText('Private key (KS_AGENT_KEY env var)')).toBeVisible();
  827 |   });
  828 | 
  829 |   test('user registers an agent with a manually pasted pubkey', async ({ page }) => {
  830 |     await installMockApi(page);
  831 |     await seedAuth(page);
  832 |     await page.goto('/');
  833 |     await page.getByRole('button', { name: 'Agents' }).click();
  834 | 
  835 |     await page.getByPlaceholder('Agent name (e.g. trading-bot-v1)').fill('data-fetcher');
  836 |     await page.getByPlaceholder('Agent public key (base58)').fill('4s3Yk1NyFQKkCqW2GMk1mN6S8Uh8x5X2MZf8xdUzG2pR');
  837 |     await page.getByRole('button', { name: 'Register' }).click();
  838 | 
  839 |     // Success banner
  840 |     await expect(page.getByText('Agent "data-fetcher" registered')).toBeVisible();
  841 |     // Agent row appears in the list
  842 |     await expect(page.getByText('data-fetcher')).toBeVisible();
  843 |   });
  844 | 
  845 |   test('user can set a scoped grant (proxy only) when registering', async ({ page }) => {
  846 |     await installMockApi(page);
  847 |     await seedAuth(page);
  848 |     await page.goto('/');
  849 |     await page.getByRole('button', { name: 'Agents' }).click();
  850 | 
  851 |     await page.getByPlaceholder('Agent name (e.g. trading-bot-v1)').fill('limited-bot');
  852 |     await page.getByPlaceholder('Agent public key (base58)').fill('4s3Yk1NyFQKkCqW2GMk1mN6S8Uh8x5X2MZf8xdUzG2pR');
  853 |     await page.locator('select').selectOption('proxy');
  854 |     await page.getByRole('button', { name: 'Register' }).click();
  855 | 
  856 |     await expect(page.getByText('limited-bot')).toBeVisible();
  857 |     // Scope badge
  858 |     await expect(page.getByText('proxy')).toBeVisible();
  859 |   });
  860 | 
  861 |   test('user registers a second agent after generating a fresh keypair', async ({ page }) => {
  862 |     await installMockApi(page);
  863 |     await seedAuth(page);
  864 |     await page.goto('/');
  865 |     await page.getByRole('button', { name: 'Agents' }).click();
  866 | 
  867 |     // Register first agent manually
  868 |     await page.getByPlaceholder('Agent name (e.g. trading-bot-v1)').fill('first-bot');
  869 |     await page.getByPlaceholder('Agent public key (base58)').fill('4s3Yk1NyFQKkCqW2GMk1mN6S8Uh8x5X2MZf8xdUzG2pR');
  870 |     await page.getByRole('button', { name: 'Register' }).click();
  871 |     await expect(page.getByText('first-bot')).toBeVisible();
  872 | 
  873 |     // Generate a new keypair for the second agent
  874 |     await page.getByRole('button', { name: 'Generate' }).click();
  875 |     await page.getByPlaceholder('Agent name (e.g. trading-bot-v1)').fill('second-bot');
  876 |     await page.getByRole('button', { name: 'Register' }).click();
  877 |     await expect(page.getByText('second-bot')).toBeVisible();
  878 | 
  879 |     // Both agents listed
  880 |     await expect(page.getByText('first-bot')).toBeVisible();
  881 |     await expect(page.getByText('second-bot')).toBeVisible();
  882 |   });
  883 | 
  884 |   test('revoking an agent requires two clicks and removes it from the list', async ({ page }) => {
  885 |     await installMockApi(page);
  886 |     await seedAuth(page);
  887 |     await page.goto('/');
  888 |     await page.getByRole('button', { name: 'Agents' }).click();
```