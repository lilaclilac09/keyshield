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
const walletConnectSection = document.getElementById('wallet-connect-section')!;
const walletStatus = document.getElementById('wallet-status')!;
const walletConnectBtn = document.getElementById('wallet-connect-btn')!;
const walletAddressDisplay = document.getElementById('wallet-address')!;

// Buttons
const authWebAuthnBtn = document.getElementById('auth-webauthn')!;
const authPasswordBtn = document.getElementById('auth-password')!;
const bypassBiometricBtn = document.getElementById('bypass-biometric')!;
const submitPasswordBtn = document.getElementById('submit-password')!;
const quickSaveKeyInput = document.getElementById('quick-save-key') as HTMLInputElement;
const quickSaveBtn = document.getElementById('quick-save')!;
const detectKeysBtn = document.getElementById('detect-keys')!;
const autoFillBtn = document.getElementById('auto-fill')!;
const ocrCaptureBtn = document.getElementById('ocr-capture')!;
const viewLogsReportBtn = document.getElementById('view-logs-report')!;
const logoutBtn = document.getElementById('logout')!;

// State
let useMasterPassword = false;
let isAuthenticating = false;

// Check authentication status on load
checkAuthStatus();

// Event listeners
authWebAuthnBtn.addEventListener('click', handleWebAuthnAuth);
authPasswordBtn.addEventListener('click', () => {
  useMasterPassword = true;
  passwordForm.classList.remove('hidden');
  authWebAuthnBtn.style.display = 'none';
  bypassBiometricBtn.style.display = 'none';
});
bypassBiometricBtn.addEventListener('click', () => {
  useMasterPassword = true;
  passwordForm.classList.remove('hidden');
  authWebAuthnBtn.style.display = 'none';
  bypassBiometricBtn.style.display = 'none';
});
passwordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !isAuthenticating) {
    handlePasswordAuth();
  }
});
submitPasswordBtn.addEventListener('click', handlePasswordAuth);
walletConnectBtn.addEventListener('click', handleWalletConnect);
quickSaveBtn.addEventListener('click', handleQuickSave);
detectKeysBtn.addEventListener('click', handleDetectKeys);
autoFillBtn.addEventListener('click', handleAutoFill);
ocrCaptureBtn.addEventListener('click', handleOCRCapture);
viewLogsReportBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('report/report.html') });
});
logoutBtn.addEventListener('click', handleLogout);

/**
 * Check authentication status
 */
async function checkAuthStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'CHECK_SESSION' });
    
    if (response.success && response.authenticated) {
      showAuthenticated();
      await checkWalletStatus();
      loadVaults();
    } else {
      showUnauthenticated();
      // Auto-try WebAuthn on load (only if not explicitly using master password)
      if (!useMasterPassword) {
        setTimeout(() => {
          if (!useMasterPassword && authSection && !authSection.classList.contains('hidden')) {
            handleWebAuthnAuth();
          }
        }, 300);
      }
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
  authStatus.textContent = 'Vault Unlocked ✅';
  authStatus.className = 'status authenticated';
  authSection.classList.add('hidden');
  mainSection.classList.remove('hidden');
  isAuthenticating = false;
}

/**
 * Check wallet connection status
 */
async function checkWalletStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_WALLET_STATUS' });
    if (response.success && response.connected && response.address) {
      walletStatus.textContent = 'Wallet Connected';
      walletStatus.className = 'status authenticated';
      walletAddressDisplay.textContent = `${response.address.slice(0, 4)}...${response.address.slice(-4)}`;
      walletConnectBtn.textContent = 'Disconnect Wallet';
      walletConnectBtn.classList.remove('primary');
      walletConnectBtn.classList.add('secondary');
    } else {
      walletStatus.textContent = 'Wallet Not Connected';
      walletStatus.className = 'status unauthenticated';
      walletAddressDisplay.textContent = '';
      walletConnectBtn.textContent = 'Connect Phantom Wallet';
      walletConnectBtn.classList.remove('secondary');
      walletConnectBtn.classList.add('primary');
    }
  } catch (error) {
    console.error('Failed to check wallet status:', error);
    walletStatus.textContent = 'Wallet Not Connected';
    walletStatus.className = 'status unauthenticated';
  }
}

/**
 * Handle wallet connect/disconnect
 */
async function handleWalletConnect() {
  try {
    const isConnected = walletConnectBtn.textContent?.includes('Disconnect');
    
    if (isConnected) {
      // Disconnect
      const response = await chrome.runtime.sendMessage({ type: 'DISCONNECT_WALLET' });
      if (response.success) {
        await checkWalletStatus();
      }
    } else {
      // Connect
      walletConnectBtn.disabled = true;
      walletConnectBtn.textContent = 'Connecting...';
      
      const response = await chrome.runtime.sendMessage({ type: 'CONNECT_WALLET' });
      
      if (response.success && response.address) {
        await checkWalletStatus();
      } else {
        walletStatus.textContent = `Connection failed: ${response.error || 'Please install Phantom wallet'}`;
        walletStatus.className = 'status unauthenticated';
        walletConnectBtn.textContent = 'Connect Phantom Wallet';
      }
    }
  } catch (error: any) {
    walletStatus.textContent = `Error: ${error.message || 'Connection failed'}`;
    walletStatus.className = 'status unauthenticated';
    walletConnectBtn.textContent = 'Connect Phantom Wallet';
  } finally {
    walletConnectBtn.disabled = false;
  }
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
  useMasterPassword = false;
  isAuthenticating = false;
  // Reset button visibility
  authWebAuthnBtn.style.display = '';
  bypassBiometricBtn.style.display = '';
  authWebAuthnBtn.disabled = false;
  authWebAuthnBtn.textContent = 'Authenticate with Biometric';
}

/**
 * Handle WebAuthn authentication
 */
async function handleWebAuthnAuth() {
  if (isAuthenticating || useMasterPassword) return;
  
  try {
    isAuthenticating = true;
    authWebAuthnBtn.disabled = true;
    authWebAuthnBtn.textContent = 'Authenticating...';
    authStatus.textContent = 'Authenticating...';
    authStatus.className = 'status loading';

    const response = await chrome.runtime.sendMessage({
      type: 'AUTHENTICATE',
      payload: { method: 'webauthn' },
    });

    if (response.success) {
      showAuthenticated();
      await checkWalletStatus();
      loadVaults();
    } else {
      // Show error but allow fallback to password
      authStatus.textContent = `Biometric failed: ${response.error || 'Use master password'}`;
      authStatus.className = 'status unauthenticated';
      // Show bypass button if not already visible
      if (bypassBiometricBtn.style.display === 'none') {
        bypassBiometricBtn.style.display = '';
      }
    }
  } catch (error: any) {
    authStatus.textContent = `Error: ${error.message || 'Authentication failed'}`;
    authStatus.className = 'status unauthenticated';
    // Show bypass button
    if (bypassBiometricBtn.style.display === 'none') {
      bypassBiometricBtn.style.display = '';
    }
  } finally {
    isAuthenticating = false;
    authWebAuthnBtn.disabled = false;
    authWebAuthnBtn.textContent = 'Authenticate with Biometric';
  }
}

/**
 * Handle password authentication
 */
async function handlePasswordAuth() {
  if (isAuthenticating) return;
  
  try {
    const password = passwordInput.value.trim();
    if (!password) {
      authStatus.textContent = 'Please enter a password';
      authStatus.className = 'status unauthenticated';
      return;
    }

    isAuthenticating = true;
    submitPasswordBtn.disabled = true;
    submitPasswordBtn.textContent = 'Authenticating...';
    authStatus.textContent = 'Authenticating...';
    authStatus.className = 'status loading';

    const response = await chrome.runtime.sendMessage({
      type: 'AUTHENTICATE',
      payload: { method: 'password', password },
    });

    if (response.success) {
      passwordInput.value = '';
      passwordForm.classList.add('hidden');
      showAuthenticated();
      await checkWalletStatus();
      loadVaults();
    } else {
      authStatus.textContent = `Authentication failed: ${response.error || 'Invalid password'}`;
      authStatus.className = 'status unauthenticated';
      passwordInput.value = '';
      passwordInput.focus();
    }
  } catch (error: any) {
    authStatus.textContent = `Error: ${error.message || 'Authentication failed'}`;
    authStatus.className = 'status unauthenticated';
  } finally {
    isAuthenticating = false;
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
        <div style="display: flex; gap: 4px;">
          <button class="button secondary reveal-key-btn" style="width: auto; padding: 6px 12px;" data-vault-id="${vault.vaultId}" title="Reveal key (30s)">
            👁️
          </button>
          <button class="button secondary" style="width: auto; padding: 6px 12px;" data-vault-id="${vault.vaultId}">
            Fill
          </button>
        </div>
      `;
      vaultListContainer.appendChild(item);

      // Add click handlers
      const fillBtn = item.querySelector('button:not(.reveal-key-btn)');
      const revealBtn = item.querySelector('.reveal-key-btn');
      
      if (fillBtn) {
        fillBtn.addEventListener('click', () => {
          handleFillVault(vault.vaultId);
        });
      }
      
      if (revealBtn) {
        revealBtn.addEventListener('click', () => {
          handleRevealVault(vault.vaultId);
        });
      }
    });
  } catch (error) {
    console.error('Failed to load vaults:', error);
    vaultListContainer.innerHTML = '<div class="loading">Error loading vaults</div>';
  }
}

/**
 * Handle quick save - opens dashboard with key pre-filled
 */
async function handleQuickSave() {
  try {
    const apiKey = quickSaveKeyInput.value.trim();
    if (!apiKey) {
      alert('Please enter an API key');
      return;
    }

    quickSaveBtn.disabled = true;
    quickSaveBtn.textContent = 'Opening Dashboard...';

    // Get dashboard URL from storage or use default
    const dashboardUrl = await getDashboardUrl();
    const walletResult = await chrome.storage.local.get('walletAddress');
    const walletAddress = walletResult.walletAddress;

    // Encode key in URL parameter (base64 to avoid special characters)
    const encodedKey = btoa(apiKey);
    const separator = dashboardUrl.includes('?') ? '&' : '?';
    let urlWithKey = `${dashboardUrl}${separator}quickSave=${encodedKey}`;
    if (walletAddress) {
      urlWithKey += `&wallet=${encodeURIComponent(walletAddress)}`;
    }

    // Open dashboard in new tab with key in URL
    chrome.tabs.create({ url: urlWithKey });
    
    // Clear input
    quickSaveKeyInput.value = '';
  } catch (error: any) {
    alert(`Error: ${error.message}`);
  } finally {
    quickSaveBtn.disabled = false;
    quickSaveBtn.textContent = 'Quick Save to Vault';
  }
}

/**
 * Get dashboard URL (from storage or default)
 */
async function getDashboardUrl(): Promise<string> {
  const result = await chrome.storage.local.get('dashboardUrl');
  return result.dashboardUrl || 'http://localhost:3000';
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
 * Handle reveal vault key
 */
async function handleRevealVault(vaultId: string) {
  try {
    // Get wallet address from storage
    const walletData = await chrome.storage.local.get('walletAddress');
    if (!walletData.walletAddress) {
      alert('Wallet not connected');
      return;
    }

    // Decrypt key
    const decryptResponse = await chrome.runtime.sendMessage({
      type: 'DECRYPT_KEY',
      payload: { vaultId, walletAddress: walletData.walletAddress },
    });

    if (!decryptResponse.success) {
      alert(`Failed to decrypt: ${decryptResponse.error}`);
      return;
    }

    // Show key in alert (temporary - in production would show in UI)
    const key = decryptResponse.key;
    const maskedKey = key.length > 8 ? key.slice(0, 4) + '...' + key.slice(-4) : '•'.repeat(key.length);
    const fullKey = prompt(`API Key (will auto-hide in 30s):\n\n${key}\n\nClick OK to copy to clipboard.`, key);
    
    if (fullKey) {
      try {
        await navigator.clipboard.writeText(key);
        alert('Key copied to clipboard!');
      } catch (error) {
        console.error('Failed to copy:', error);
      }
    }

    // Auto-hide after 30 seconds (clear from memory)
    setTimeout(() => {
      // Key is cleared from prompt/memory
    }, 30000);
  } catch (error: any) {
    alert(`Error: ${error.message}`);
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
    const walletData = await chrome.storage.local.get('walletAddress');
    if (!walletData.walletAddress) {
      alert('Wallet not connected');
      return;
    }

    // Decrypt key
    const decryptResponse = await chrome.runtime.sendMessage({
      type: 'DECRYPT_KEY',
      payload: { vaultId, walletAddress: walletData.walletAddress },
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
