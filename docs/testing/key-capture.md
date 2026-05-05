# Key capture QA test plan

User-facing QA scenarios for key save, browser auto-detect, and agent usage.

## Scope

- Manual key save in Vault UI.
- Browser auto-detect of API keys (extension + content script).
- Agent flows that use stored keys via proxy.

## Preconditions

- `scripts/dev.sh` running (frontend + server + proxy).
- A valid session token (passphrase or wallet login).
- Chrome extension loaded from `frontend/`.
- Test API keys (non-production) for at least two providers (for example: OpenAI, Helius).

## Test cases

### 1) Manual save: API key

**Goal:** A user can add an API key in the Vault UI and use it via proxy.

Steps:
1. Open the web UI and log in.
2. Go to Vault, click Add Key.
3. Choose type `api_key`.
4. Enter name `openai` and paste a test key.
5. Save and verify the key appears in the list.
6. Use the Developer section curl example for `/proxy/openai/`.
7. Confirm a 200 response from the upstream and non-empty response body.

Expected:
- Key shows in Vault list.
- Proxy call succeeds using injected key.
- Usage history shows a new entry after the proxy call.

### 2) Manual save: env-style secret

**Goal:** User can store an env-style secret and retrieve it.

Steps:
1. In Vault, add a key with type `env__`.
2. Name it `SOME_SERVICE_TOKEN` and store a test value.
3. Use the Vault decrypt action to reveal it.

Expected:
- The stored value matches exactly.
- Audit trail shows a decrypt event.

### 3) Auto-detect: new key in browser

**Goal:** Extension detects a fresh key on a page and prompts to save.

Steps:
1. Open a provider dashboard page in Chrome.
2. Create a new test key via the provider UI.
3. Observe the extension or web UI prompt to save.
4. Accept the prompt and save with the suggested provider name.
5. Verify the key is now in Vault list.

Expected:
- The detection prompt appears within a few seconds.
- Suggested provider name is correct.
- Saved key matches the generated key.

### 4) Auto-detect: clipboard capture flow

**Goal:** If the user copies a key, the extension should prompt to save.

Steps:
1. Copy a valid API key from a provider page.
2. Switch to the extension popup.
3. Confirm the key appears in the capture UI.
4. Save and verify in Vault list.

Expected:
- Clipboard capture shows the key once.
- Saving produces a Vault entry with correct value.

### 5) Auto-detect: false positive guard

**Goal:** Non-key strings should not be captured or stored.

Steps:
1. Copy a random UUID and a short token-like string.
2. Verify no prompt appears.
3. Check Vault list to confirm no new entries.

Expected:
- No capture prompt for non-matching strings.
- Vault list unchanged.

### 6) Agent: register and use key via proxy

**Goal:** An agent can be registered and use a stored key via proxy.

Steps:
1. In Agents section, register a new agent keypair.
2. Store a test API key in Vault.
3. From a terminal, use the agent token to call `/proxy/{upstream}/`.
4. Confirm the upstream responds successfully.

Expected:
- Agent shows in list with correct public key.
- Proxy call succeeds under agent auth.
- Usage history shows agent identity.

### 7) Agent: revoke and verify denial

**Goal:** Revoked agents lose access immediately.

Steps:
1. Revoke the agent created above.
2. Repeat the same proxy call as the agent.

Expected:
- Proxy call fails with auth error.
- No new usage entry for the revoked agent.

### 8) Regression: key save persists across sessions

**Goal:** Keys remain after logout/login.

Steps:
1. Log out of the UI.
2. Log back in.
3. Check Vault list.

Expected:
- Previously saved keys are still present.

## Notes

- If auto-detect is flaky, confirm `frontend/content.js` is loaded and matches provider patterns.
- For upstream calls, use low-risk endpoints that do not mutate data.
