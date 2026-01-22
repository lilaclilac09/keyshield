/**
 * Popup UI Controller
 */

// UI Elements
const authStatus = document.getElementById('auth-status')!;
const authSection = document.getElementById('auth-section')!;
const mainSection = document.getElementById('main-section')!;
const passwordForm = document.getElementById('password-form')!;
const passwordInput = document.getElementById('password-input') as HTMLInputElement;
const vaultListContainer = document.getElementById('vault-list-container')!;

// Buttons
const authWebAuthnBtn = document.getElementById('auth-webauthn')!;
const authPasswordBtn = document.getElementById('auth-password')!;
const submitPasswordBtn = document.getElementById('submit-password')!;
const detectKeysBtn = document.getElementById('detect-keys')!;
const autoFillBtn = document.getElementById('auto-fill')!;
const ocrCaptureBtn = document.getElementById('ocr-capture')!;
const logoutBtn = document.getElementById('logout')!;

// Check authentication status on load
checkAuthStatus();

// Event listeners
authWebAuthnBtn.addEventListener('click', handleWebAuthnAuth);
authPasswordBtn.addEventListener('click', () => {
  passwordForm.classList.remove('hidden');
});
submitPasswordBtn.addEventListener('click', handlePasswordAuth);
detectKeysBtn.addEventListener('click', handleDetectKeys);
autoFillBtn.addEventListener('click', handleAutoFill);
ocrCaptureBtn.addEventListener('click', handleOCRCapture);
logoutBtn.addEventListener('click', handleLogout);

/**
 * Check authentication status
 */
async function checkAuthStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'CHECK_SESSION' });
    
    if (response.success && response.authenticated) {
      showAuthenticated();
      loadVaults();
    } else {
      showUnauthenticated();
    }
  } catch (error) {
    console.error('Failed to check auth status:', error);
    showUnauthenticated();
  }
}

/**
 * Show authenticated UI
 */
function showAuthenticated() {
  authStatus.textContent = 'Authenticated';
  authStatus.className = 'status authenticated';
  authSection.classList.add('hidden');
  mainSection.classList.remove('hidden');
}

/**
 * Show unauthenticated UI
 */
function showUnauthenticated() {
  authStatus.textContent = 'Not authenticated';
  authStatus.className = 'status unauthenticated';
  authSection.classList.remove('hidden');
  mainSection.classList.add('hidden');
  passwordForm.classList.add('hidden');
}

/**
 * Handle WebAuthn authentication
 */
async function handleWebAuthnAuth() {
  try {
    authWebAuthnBtn.disabled = true;
    authWebAuthnBtn.textContent = 'Authenticating...';

    const response = await chrome.runtime.sendMessage({
      type: 'AUTHENTICATE',
      payload: { method: 'webauthn' },
    });

    if (response.success) {
      showAuthenticated();
      loadVaults();
    } else {
      alert(`Authentication failed: ${response.error}`);
    }
  } catch (error: any) {
    alert(`Error: ${error.message}`);
  } finally {
    authWebAuthnBtn.disabled = false;
    authWebAuthnBtn.textContent = 'Authenticate with Biometric';
  }
}

/**
 * Handle password authentication
 */
async function handlePasswordAuth() {
  try {
    const password = passwordInput.value;
    if (!password) {
      alert('Please enter a password');
      return;
    }

    submitPasswordBtn.disabled = true;
    submitPasswordBtn.textContent = 'Authenticating...';

    const response = await chrome.runtime.sendMessage({
      type: 'AUTHENTICATE',
      payload: { method: 'password', password },
    });

    if (response.success) {
      passwordInput.value = '';
      passwordForm.classList.add('hidden');
      showAuthenticated();
      loadVaults();
    } else {
      alert(`Authentication failed: ${response.error}`);
    }
  } catch (error: any) {
    alert(`Error: ${error.message}`);
  } finally {
    submitPasswordBtn.disabled = false;
    submitPasswordBtn.textContent = 'Authenticate';
  }
}

/**
 * Load and display vaults
 */
async function loadVaults() {
  try {
    vaultListContainer.innerHTML = '<div class="loading">Loading vaults...</div>';

    // Get current tab to get domain
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const domain = new URL(tab.url || '').hostname;

    // Get vaults for current domain from background script
    const response = await chrome.runtime.sendMessage({
      type: 'GET_VAULTS_BY_DOMAIN',
      payload: { domain },
    });

    if (!response.success) {
      vaultListContainer.innerHTML = '<div class="loading">Error loading vaults</div>';
      return;
    }

    const vaults = response.vaults || [];

    if (vaults.length === 0) {
      vaultListContainer.innerHTML = '<div class="loading">No vaults found for this domain</div>';
      return;
    }

    vaultListContainer.innerHTML = '';
    vaults.forEach((vault) => {
      const item = document.createElement('div');
      item.className = 'vault-item';
      item.innerHTML = `
        <div class="vault-info">
          <div class="vault-name">${vault.keyName}</div>
          <div class="vault-domain">${vault.domain}</div>
        </div>
        <button class="button secondary" style="width: auto; padding: 6px 12px;" data-vault-id="${vault.vaultId}">
          Fill
        </button>
      `;
      vaultListContainer.appendChild(item);

      // Add click handler
      item.querySelector('button')?.addEventListener('click', () => {
        handleFillVault(vault.vaultId);
      });
    });
  } catch (error) {
    console.error('Failed to load vaults:', error);
    vaultListContainer.innerHTML = '<div class="loading">Error loading vaults</div>';
  }
}

/**
 * Handle detect keys
 */
async function handleDetectKeys() {
  try {
    detectKeysBtn.disabled = true;
    detectKeysBtn.textContent = 'Detecting...';

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) {
      throw new Error('No active tab');
    }

    const response = await chrome.tabs.sendMessage(tab.id, { type: 'DETECT_KEYS' });

    if (response.success && response.detected.length > 0) {
      alert(`Found ${response.detected.length} potential key(s)!`);
      // In production, show a dialog to save keys
    } else {
      alert('No keys detected on this page');
    }
  } catch (error: any) {
    alert(`Error: ${error.message}`);
  } finally {
    detectKeysBtn.disabled = false;
    detectKeysBtn.textContent = 'Detect Keys on Page';
  }
}

/**
 * Handle auto-fill
 */
async function handleAutoFill() {
  try {
    autoFillBtn.disabled = true;
    autoFillBtn.textContent = 'Filling...';

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) {
      throw new Error('No active tab');
    }

    const domain = new URL(tab.url || '').hostname;
    const response = await chrome.runtime.sendMessage({
      type: 'TRIGGER_AUTO_FILL',
      payload: { domain },
    });

    if (response.success) {
      alert('Key filled successfully!');
    } else {
      alert(`Failed: ${response.error}`);
    }
  } catch (error: any) {
    alert(`Error: ${error.message}`);
  } finally {
    autoFillBtn.disabled = false;
    autoFillBtn.textContent = 'Auto-Fill Keys';
  }
}

/**
 * Handle OCR capture
 */
async function handleOCRCapture() {
  try {
    ocrCaptureBtn.disabled = true;
    ocrCaptureBtn.textContent = 'Capturing...';

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const domain = new URL(tab.url || '').hostname;

    const response = await chrome.runtime.sendMessage({
      type: 'OCR_CAPTURE',
      payload: { domain },
    });

    if (response.success && response.detected.length > 0) {
      alert(`Found ${response.detected.length} key(s) via OCR!`);
    } else {
      alert('No keys detected in screen capture');
    }
  } catch (error: any) {
    alert(`Error: ${error.message}`);
  } finally {
    ocrCaptureBtn.disabled = false;
    ocrCaptureBtn.textContent = 'Capture Screen (OCR)';
  }
}

/**
 * Handle fill vault
 */
async function handleFillVault(vaultId: string) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.id) {
      throw new Error('No active tab');
    }

    // Get wallet address from storage (would be set during setup)
    const walletAddress = await chrome.storage.local.get('walletAddress');
    if (!walletAddress.walletAddress) {
      alert('Wallet not connected');
      return;
    }

    // Decrypt key
    const decryptResponse = await chrome.runtime.sendMessage({
      type: 'DECRYPT_KEY',
      payload: { vaultId, walletAddress: walletAddress.walletAddress },
    });

    if (!decryptResponse.success) {
      alert(`Failed to decrypt: ${decryptResponse.error}`);
      return;
    }

    // Inject key
    const injectResponse = await chrome.tabs.sendMessage(tab.id, {
      type: 'INJECT_KEY',
      payload: { key: decryptResponse.key },
    });

    if (injectResponse.success) {
      alert('Key filled successfully!');
    } else {
      alert(`Failed to fill: ${injectResponse.error}`);
    }
  } catch (error: any) {
    alert(`Error: ${error.message}`);
  }
}

/**
 * Handle logout
 */
async function handleLogout() {
  try {
    // Clear session (would be handled by background script)
    showUnauthenticated();
    vaultListContainer.innerHTML = '';
  } catch (error) {
    console.error('Logout error:', error);
  }
}
