
/**
 * KeyShield Content Script
 * Monitors page for exposed API keys and provides immediate vaulting options.
 */

const KEY_PATTERNS = [
  { name: 'OpenAI', regex: /sk-[a-zA-Z0-9]{48}/g, label: 'AI' },
  { name: 'Stripe', regex: /sk_(?:live|test)_[a-zA-Z0-9]{24,}/g, label: 'FIN' },
  { name: 'GitHub', regex: /ghp_[a-zA-Z0-9]{36}/g, label: 'DEV' },
  { name: 'AWS', regex: /AKIA[0-9A-Z]{16}/g, label: 'CLD' },
  { name: 'Helius', regex: /helius_auth_[a-zA-Z0-9]{20,}/g, label: 'SOL' },
  { name: 'Generic Key', regex: /[a-zA-Z0-9]{32,64}/g, label: 'KEY' }
];

let detectedKeys = new Set();
let notificationActive = false;

function scan() {
  const text = document.body.innerText;
  const inputs = Array.from(document.querySelectorAll('input, textarea'));
  
  KEY_PATTERNS.forEach(provider => {
    // Scan text content
    let match;
    while ((match = provider.regex.exec(text)) !== null) {
      handleMatch(match[0], provider);
    }
    
    // Scan input values
    inputs.forEach(input => {
      const val = input.value;
      if (val && provider.regex.test(val)) {
        handleMatch(val, provider);
      }
    });
  });
}

function handleMatch(key, provider) {
  if (detectedKeys.has(key)) return;
  if (key.length < 20) return; 

  detectedKeys.add(key);
  console.log(`[KeyShield] Detected ${provider.name} key`);
  showNotification(key, provider);
}

function showNotification(key, provider) {
  if (notificationActive) return;
  notificationActive = true;

  const container = document.createElement('div');
  container.id = 'keyshield-detection-notice';
  Object.assign(container.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    zIndex: '999999',
    backgroundColor: '#0c0c0e',
    border: '1px solid #27272a',
    borderRadius: '4px',
    padding: '16px',
    width: '280px',
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.4)',
    color: '#fafafa',
    fontFamily: '"JetBrains Mono", monospace, system-ui',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    animation: 'keyshield-slide-in 0.2s ease-out'
  });

  const styleTag = document.createElement('style');
  styleTag.innerHTML = `
    @keyframes keyshield-slide-in {
      from { transform: translateY(-10px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    .ks-btn { cursor: pointer; border: none; border-radius: 2px; font-weight: 700; padding: 10px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; transition: all 0.2s; }
    .ks-btn-primary { background: #6366f1; color: white; }
    .ks-btn-primary:hover { background: #4f46e5; }
    .ks-btn-ghost { background: transparent; color: #71717a; border: 1px solid #27272a; }
    .ks-btn-ghost:hover { color: #fafafa; border-color: #3f3f46; }
  `;
  document.head.appendChild(styleTag);

  container.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px;">
      <div style="background: #18181b; padding: 6px; border-radius: 2px; font-size: 10px; font-weight: 900; color: #6366f1; border: 1px solid #27272a;">${provider.label}</div>
      <div>
        <div style="font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Credential Detected</div>
        <div style="color: #52525b; font-size: 9px; text-transform: uppercase;">${provider.name} provider</div>
      </div>
    </div>
    <div style="background: #050505; padding: 10px; border-radius: 2px; font-family: monospace; font-size: 10px; color: #818cf8; border: 1px solid #1e1e2e; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
      ${key.substring(0, 14)}••••••
    </div>
    <div style="display: flex; gap: 8px; margin-top: 4px;">
      <button id="ks-save" class="ks-btn ks-btn-primary" style="flex: 1;">Secure to Vault</button>
      <button id="ks-ignore" class="ks-btn ks-btn-ghost">Dismiss</button>
    </div>
  `;

  document.body.appendChild(container);

  container.querySelector('#ks-save').onclick = () => {
    chrome.runtime.sendMessage({
      type: 'SAVE_KEY',
      payload: {
        name: `${provider.name} Key`,
        value: key,
        domain: window.location.hostname,
        providerId: provider.name.toLowerCase()
      }
    });
    container.remove();
    notificationActive = false;
  };

  container.querySelector('#ks-ignore').onclick = () => {
    container.remove();
    notificationActive = false;
  };

  setTimeout(() => {
    if (container.parentNode) {
      container.remove();
      notificationActive = false;
    }
  }, 10000);
}

scan();
setInterval(scan, 3000);

const observer = new MutationObserver((mutations) => {
  let shouldScan = false;
  for (let mutation of mutations) {
    if (mutation.addedNodes.length > 0) {
      shouldScan = true;
      break;
    }
  }
  if (shouldScan) scan();
});

observer.observe(document.body, { childList: true, subtree: true });

document.addEventListener('copy', () => {
  setTimeout(scan, 500);
});
