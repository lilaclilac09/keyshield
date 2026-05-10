// Auth module: wallet connection, signing, token management
// Pattern: Handles Phantom's specific error patterns

import type { LoginToken } from '../types';

// ============ Types ============

export interface WalletProvider {
  publicKey?: { toString(): string; toBytes(): Uint8Array };
  isConnected?: boolean;
  connect?(opts?: Record<string, unknown>): Promise<void>;
  disconnect?(): Promise<void>;
  signMessage?(message: Uint8Array, encoding?: string): Promise<{ signature: Uint8Array } | Uint8Array>;
  sign?(message: Uint8Array): Promise<{ signature: Uint8Array }>;
  isPhantom?: boolean;
  isSolflare?: boolean;
  isBackpack?: boolean;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  off?(event: string, handler: (...args: unknown[]) => void): void;
}

export interface WalletInfo {
  name: string;
  key: string;
  icon: string;
  url: string;
  provider: WalletProvider;
  isInstalled: boolean;
  isConnected: boolean;
  address: string | null;
}

// ============ Detection ============

function getWin(): any {
  return typeof window !== 'undefined' ? window : {};
}

const REGISTRY = [
  {
    key: 'phantom',
    name: 'Phantom',
    icon: 'https://phantom.app/img/favicon.png',
    url: 'https://phantom.app/',
    get: (): WalletProvider | null => {
      const w = getWin();
      return w.phantom?.solana ?? w.solana ?? null;
    },
  },
  {
    key: 'solflare',
    name: 'Solflare',
    icon: 'https://solflare.com/favicon.ico',
    url: 'https://solflare.com/',
    get: (): WalletProvider | null => getWin().solflare ?? null,
  },
  {
    key: 'backpack',
    name: 'Backpack',
    icon: 'https://backpack.app/favicon.ico',
    url: 'https://backpack.app/',
    get: (): WalletProvider | null => getWin().backpack ?? null,
  },
];

export function detectWallets(): WalletInfo[] {
  return REGISTRY.map(({ key, name, icon, url, get }) => {
    let provider: WalletProvider | null;
    try { provider = get(); } catch { provider = null; }
    const isInstalled = !!provider;
    const isConnected = !!(provider?.isConnected || provider?.publicKey);
    const address = (provider?.isConnected || provider?.publicKey) ? provider?.publicKey?.toString() ?? null : null;
    return { name, key, icon, url, provider: provider as WalletProvider, isInstalled, isConnected, address };
  });
}

export function getAvailableWallets(): WalletInfo[] {
  return detectWallets().filter(w => w.isInstalled);
}

export function getConnectedWallet(): WalletInfo | null {
  return detectWallets().find(w => w.isConnected) ?? null;
}

// ============ Connection ============

export async function connectWalletByKey(key: string): Promise<WalletInfo> {
  const source = REGISTRY.find(s => s.key === key);
  if (!source) throw new Error(`Unknown wallet: ${key}`);

  let provider: WalletProvider | null;
  try { provider = source.get(); } catch { provider = null; }

  if (!provider) {
    throw new Error(`${source.name} not detected. Install from ${source.url}`);
  }

  console.log('[KeyShield] Provider found:', {
    name: source.name,
    hasConnect: typeof provider.connect === 'function',
    hasSignMessage: typeof provider.signMessage === 'function',
    hasPublicKey: !!provider.publicKey,
    isConnected: provider.isConnected,
    publicKey: provider.publicKey?.toString()?.slice(0, 8) + '...',
    keys: Object.keys(provider),
  });

  // Already connected?
  if (provider.publicKey) {
    console.log('[KeyShield] Already has publicKey');
    return buildWalletInfo(source, provider);
  }

  if (typeof provider.connect !== 'function') {
    throw new Error(`${source.name} does not support connect().`);
  }

  // Try connect - Phantom can throw "Unexpected error" for several reasons
  try {
    console.log('[KeyShield] Calling connect()...');
    await provider.connect();
    console.log('[KeyShield] connect() resolved');

    if (provider.publicKey) {
      return buildWalletInfo(source, provider);
    }
    throw new Error(`${source.name} connected but returned no address.`);
  } catch (rawError: unknown) {
    console.error('[KeyShield] connect() threw:', rawError);
    const msg = extractErrorMessage(rawError);

    // Check if we got a publicKey despite the error
    if (provider.publicKey) {
      console.log('[KeyShield] Error but publicKey exists');
      return buildWalletInfo(source, provider);
    }

    // --- Phantom-specific error handling ---
    const isPhantom = key === 'phantom';

    if (msg.includes('Unexpected error') || (isPhantom && rawError && typeof rawError === 'object' && (rawError as any).name === 'Me')) {
      // Phantom throws Me: Unexpected error when:
      // 1. No wallet created in Phantom
      // 2. Phantom is locked (needs password)
      // 3. Popup was blocked
      throw new Error(
        'Phantom connection failed. This usually means:\n' +
        '• No wallet created in Phantom — open the extension and set one up\n' +
        '• Phantom is locked — unlock it with your password\n' +
        '• Pop-up was blocked — check your browser pop-up settings'
      );
    }

    if (isUserRejection(msg)) {
      throw new Error('Connection rejected. Please approve the popup.');
    }

    throw new Error(`Connection failed: ${msg}`);
  }
}

function buildWalletInfo(source: typeof REGISTRY[0], provider: WalletProvider): WalletInfo {
  return {
    name: source.name, key: source.key, icon: source.icon, url: source.url, provider,
    isInstalled: true, isConnected: true,
    address: provider.publicKey!.toString(),
  };
}

export async function disconnectWallet(): Promise<void> {
  const wallets = detectWallets();
  for (const w of wallets) {
    if (w.isConnected && typeof w.provider.disconnect === 'function') {
      try { await w.provider.disconnect(); } catch {}
    }
  }
}

// ============ Signing ============

export const VAULT_KEY_MESSAGE = 'KeyShield Vault Authentication';

export async function signWithWallet(
  message: string,
  provider: WalletProvider
): Promise<Uint8Array> {
  if (!provider) throw new Error('No wallet provider.');
  if (!provider.publicKey) throw new Error('Wallet not connected.');

  const encoded = new TextEncoder().encode(message);

  if (typeof provider.signMessage === 'function') {
    try {
      const result = await provider.signMessage(encoded, 'utf8');
      if (result instanceof Uint8Array) return result;
      const r = result as { signature?: Uint8Array };
      if (r.signature instanceof Uint8Array) return r.signature;
      throw new Error('signMessage returned unexpected format');
    } catch (rawError: unknown) {
      const msg = extractErrorMessage(rawError);
      if (isUserRejection(msg)) throw new Error('Signature rejected.');
      throw new Error(`Signing failed: ${msg}`);
    }
  }

  if (typeof provider.sign === 'function') {
    try {
      const result = await provider.sign(encoded);
      if (result instanceof Uint8Array) return result;
      const r = result as { signature?: Uint8Array };
      if (r.signature instanceof Uint8Array) return r.signature;
    } catch {}
  }

  throw new Error('Wallet does not support signing.');
}

export async function deriveVaultPassphrase(signatureBytes: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', signatureBytes.buffer as ArrayBuffer);
  const bytes = new Uint8Array(hashBuffer);
  return btoa(Array.from(bytes).map(b => String.fromCharCode(b)).join(''));
}

// ============ Session Token ============

export async function generateSessionToken(walletAddress: string, signatureBytes: Uint8Array): Promise<LoginToken> {
  const hexSig = Array.from(signatureBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({
    sub: walletAddress,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400 * 7,
    iss: 'keyshield',
    sig: hexSig.slice(0, 16),
  }));
  const token = `${header}.${payload}.demo`;

  return { token, wallet_address: walletAddress, expires_at: new Date(Date.now() + 86400000 * 7).toISOString() };
}

// ============ Token Storage ============

const TOKEN_KEY = 'ks_token';
const WALLET_KEY = 'ks_wallet';
const DEMO_FLAG = 'ks_demo';

export function saveToken(token: LoginToken, isDemo = false) {
  localStorage.setItem(TOKEN_KEY, token.token);
  if (token.wallet_address) localStorage.setItem(WALLET_KEY, token.wallet_address);
  localStorage.setItem('ks_token_expiry', token.expires_at);
  if (isDemo) localStorage.setItem(DEMO_FLAG, '1');
  else localStorage.removeItem(DEMO_FLAG);
}

export function getToken(): string | null { return localStorage.getItem(TOKEN_KEY); }
export function getWalletAddress(): string | null { return localStorage.getItem(WALLET_KEY); }
export function isDemoMode(): boolean { return localStorage.getItem(DEMO_FLAG) === '1'; }

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(WALLET_KEY);
  localStorage.removeItem(DEMO_FLAG);
  localStorage.removeItem('ks_token_expiry');
}

export function isAuthenticated(): boolean {
  const token = getToken();
  const expiry = localStorage.getItem('ks_token_expiry');
  if (!token || !expiry) return false;
  return new Date(expiry) > new Date();
}

// ============ Error Handling ============

function extractErrorMessage(raw: unknown): string {
  if (raw instanceof Error) return raw.message;
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.message === 'string' && obj.message) return obj.message;
    if (typeof obj.error === 'string' && obj.error) return obj.error;
    if (typeof obj.code === 'string') return obj.code;
    try { return JSON.stringify(obj); } catch { return String(obj); }
  }
  return raw != null ? String(raw) : 'Unknown error';
}

function isUserRejection(msg: string): boolean {
  const lower = msg.toLowerCase();
  return lower.includes('reject') || lower.includes('cancel') || lower.includes('denied') || lower.includes('user') || lower.includes('refused');
}

// ── Path A auth (passkey, vault unlock, apiFetch, extension bridge) ──
export {
  API_BASE,
  apiFetch,
  proxyFetch,
  fetchChallenge,
  walletLogin,
  passkeyLogin,
  setPasskeyTrust,
  getPasskeyTrust,
  clearPasskeyTrust,
  notifyAuthChanged,
  setToken,
  setWalletAddress,
  clearTokenInExtension,
  pushTokenToExtension,
  pingExtension,
  requestVaultUnlock,
  deletePasskey,
  registerPasskey,
  listPasskeys,
} from './auth-pathA';
