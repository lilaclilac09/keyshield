# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: user-flows.spec.ts >> add secrets — all types >> switch provider to Anthropic before saving
- Location: tests/e2e/user-flows.spec.ts:211:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'Anthropic Claude' })
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByRole('heading', { name: 'Anthropic Claude' })

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
              - option "OpenAI"
              - option "Anthropic Claude" [selected]
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
            - textbox "sk-ant-api03-…" [ref=e67]: sk-ant-api03-test-anthropic-key
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
  121 |     }
  122 | 
  123 |     if (path === '/agents/register' && method === 'POST') {
  124 |       const payload = JSON.parse(req.postData() || '{}');
  125 |       const agent: AgentEntry = {
  126 |         id:           state.nextAgentId++,
  127 |         pubkey_b58:   String(payload.pubkeyB58 ?? ''),
  128 |         name:         String(payload.name ?? ''),
  129 |         scopes:       String(payload.scopes ?? '*'),
  130 |         created_at:   now,
  131 |         last_used_at: null,
  132 |       };
  133 |       state.agents.push(agent);
  134 |       return respond(route, { id: agent.id, name: agent.name });
  135 |     }
  136 | 
  137 |     if (path.startsWith('/agents/') && method === 'DELETE') {
  138 |       const id    = Number(path.replace('/agents/', ''));
  139 |       state.agents = state.agents.filter(a => a.id !== id);
  140 |       return respond(route, { ok: true });
  141 |     }
  142 | 
  143 |     // fallthrough
  144 |     return respond(route, { ok: true });
  145 |   });
  146 | 
  147 |   return state;
  148 | };
  149 | 
  150 | /** Click the "New secret" header button and assert the modal opened. */
  151 | const openNewSecretModal = async (page: Page) => {
  152 |   await page.getByRole('button', { name: 'New secret' }).click();
  153 |   await expect(page.getByRole('heading', { name: 'New secret' })).toBeVisible();
  154 | };
  155 | 
  156 | /**
  157 |  * Locate the API-key input field inside the modal.
  158 |  * The label text is "API key" and the input is a password-type sibling.
  159 |  */
  160 | const apiKeyInput = (page: Page) =>
  161 |   page.locator('label:has-text("API key")').locator('..').locator('input');
  162 | 
  163 | // ═══════════════════════════════════════════════════════════════════════════════
  164 | //  1.  FIRST-TIME USER EXPERIENCE
  165 | // ═══════════════════════════════════════════════════════════════════════════════
  166 | 
  167 | test.describe('empty vault state', () => {
  168 |   test('new user sees the empty vault with a call-to-action', async ({ page }) => {
  169 |     await installMockApi(page);
  170 |     await seedAuth(page);
  171 |     await page.goto('/');
  172 | 
  173 |     // Stat cards
  174 |     await expect(page.getByText('Total secrets')).toBeVisible();
  175 |     await expect(page.getByText('Used this week')).toBeVisible();
  176 |     await expect(page.getByText('Expiring soon')).toBeVisible();
  177 | 
  178 |     // Empty-state copy
  179 |     await expect(page.getByText('Your vault is empty')).toBeVisible();
  180 |     await expect(page.getByText('Add your first encrypted secret to get started.')).toBeVisible();
  181 | 
  182 |     // The "Add a secret" button inside the empty state also opens the modal
  183 |     await page.getByRole('button', { name: 'Add a secret' }).click();
  184 |     await expect(page.getByRole('heading', { name: 'New secret' })).toBeVisible();
  185 |   });
  186 | });
  187 | 
  188 | // ═══════════════════════════════════════════════════════════════════════════════
  189 | //  2.  SAVING ALL FIVE SECRET TYPES
  190 | // ═══════════════════════════════════════════════════════════════════════════════
  191 | 
  192 | test.describe('add secrets — all types', () => {
  193 |   test('save an OpenAI API key (default provider)', async ({ page }) => {
  194 |     await installMockApi(page);
  195 |     await seedAuth(page);
  196 |     await page.goto('/');
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
> 221 |     await expect(page.getByRole('heading', { name: 'Anthropic Claude' })).toBeVisible();
      |                                                                           ^ Error: expect(locator).toBeVisible() failed
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
  318 |     await expect(page.getByRole('heading', { name: 'backend-staging' })).toBeVisible();
  319 |   });
  320 | 
  321 |   test('save an SSH key for production deploy access', async ({ page }) => {
```