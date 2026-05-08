/**
 * KeyShield Agentic — Popup UI
 *
 * Three tabs:
 *   Active Tab — live API key detections on the current page
 *   Vault      — stored encrypted keys, search, autofill
 *   Settings   — Lit network, RPC, trusted domains, auto-pay threshold
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

declare const chrome: typeof globalThis.chrome;

// ── Types ─────────────────────────────────────────────────────────────────────

interface DetectedKey {
  key: string;
  provider?: string;
  domain: string;
  confidence: number;
  source: string;
  timestamp: number;
}

interface VaultEntry {
  id: string;
  name: string;
  provider: string;
  domain: string;
  domains: string[];
  encrypted: boolean;
  createdAt: number;
  updatedAt: number;
}

interface RotationAlert {
  provider: string;
  domain: string;
  newKey: DetectedKey;
  oldEntryId: string;
}

type Tab = 'active' | 'vault' | 'settings';

// ── Root ──────────────────────────────────────────────────────────────────────

export function PopupApp() {
  const [tab, setTab] = useState<Tab>('active');
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletPubkey, setWalletPubkey] = useState<string | null>(null);
  const [health, setHealth] = useState<{ litConnected: boolean; vaultCount: number } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [showPubkeyInput, setShowPubkeyInput] = useState(false);
  const [manualPubkey, setManualPubkey] = useState('');
  const [sessionSigsObtained, setSessionSigsObtained] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  const refreshHealth = () => {
    chrome.runtime.sendMessage({ type: 'CHECK_HEALTH' }, (res) => {
      if (chrome.runtime.lastError) return;
      if (res) {
        setHealth({ litConnected: res.litConnected, vaultCount: res.vaultCount });
        setWalletConnected(res.walletConnected);
        setSessionSigsObtained(res.sessionSigsObtained ?? false);
      }
    });
  };

  useEffect(() => { refreshHealth(); }, []);

  // Listen for SIGN_REQUEST from background (during GET_SESSION_SIGS / x402 payment flow)
  useEffect(() => {
    const listener = (msg: { type: string; message?: number[] }) => {
      if (msg.type !== 'SIGN_REQUEST' || !msg.message) return;
      const phantom = (window as any).phantom?.solana ?? (window as any).solana;
      if (!phantom?.isPhantom) {
        console.error('[KeyShield] SIGN_REQUEST received but Phantom not available');
        return;
      }
      const msgBytes = new Uint8Array(msg.message);
      phantom.signMessage(msgBytes, 'utf8')
        .then((result: { signature: Uint8Array }) => {
          chrome.runtime.sendMessage({
            type: 'SIGN_RESPONSE',
            signature: Array.from(result.signature),
          });
        })
        .catch((err: Error) => {
          console.error('[KeyShield] Phantom signMessage rejected:', err.message);
        });
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const connectWallet = async () => {
    setConnecting(true);
    try {
      // Phantom injects window.solana into extension popup pages
      const phantom = (window as any).phantom?.solana ?? (window as any).solana;
      if (phantom?.isPhantom) {
        const resp = await phantom.connect();
        const pubkey: string = resp.publicKey.toString();
        setWalletPubkey(pubkey);
        chrome.runtime.sendMessage(
          { type: 'SET_WALLET', pubkey },
          () => { setWalletConnected(true); refreshHealth(); }
        );
      } else {
        // No Phantom — show inline pubkey input (window.prompt is blocked in extensions)
        setShowPubkeyInput(true);
      }
    } catch (err) {
      console.error('[KeyShield] wallet connect error:', err);
    } finally {
      setConnecting(false);
    }
  };

  const submitManualPubkey = () => {
    const pubkey = manualPubkey.trim();
    if (!pubkey || pubkey.length < 32) return;
    setWalletPubkey(pubkey);
    setShowPubkeyInput(false);
    setManualPubkey('');
    chrome.runtime.sendMessage(
      { type: 'SET_WALLET', pubkey },
      () => { setWalletConnected(true); refreshHealth(); }
    );
  };

  const unlockVault = () => {
    const phantom = (window as any).phantom?.solana ?? (window as any).solana;
    if (!phantom?.isPhantom) {
      alert('Phantom wallet not detected.\n\nLocal AES-encrypted keys can be copied without unlocking.\nFor Lit-encrypted keys, install Phantom and reconnect.');
      return;
    }
    setUnlocking(true);
    chrome.runtime.sendMessage({ type: 'GET_SESSION_SIGS' }, (res) => {
      setUnlocking(false);
      if (res?.success) {
        setSessionSigsObtained(true);
        refreshHealth();
      } else {
        alert(`Unlock failed: ${res?.error ?? 'Unknown error'}`);
      }
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#111' }}>
      {/* Manual pubkey entry banner (shown when Phantom not detected) */}
      {showPubkeyInput && (
        <div style={{
          padding: '8px 12px', background: '#1a1000', borderBottom: '1px solid #3a2000',
          display: 'flex', gap: 6, alignItems: 'center',
        }}>
          <input
            autoFocus
            type="text"
            placeholder="Solana pubkey (base58)..."
            value={manualPubkey}
            onChange={(e) => setManualPubkey(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitManualPubkey(); if (e.key === 'Escape') setShowPubkeyInput(false); }}
            style={{
              flex: 1, background: '#111', border: '1px solid #3a2000', color: '#fff',
              padding: '5px 8px', borderRadius: 4, fontSize: 10, fontFamily: 'monospace',
              outline: 'none',
            }}
          />
          <button
            onClick={submitManualPubkey}
            style={{
              background: '#ff6200', border: 'none', color: '#fff',
              padding: '5px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 10, fontWeight: 700,
            }}
          >OK</button>
          <button
            onClick={() => setShowPubkeyInput(false)}
            style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 14 }}
          >×</button>
        </div>
      )}
      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', height: 48, borderBottom: '1px solid #222', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldIcon size={18} color="#ff6200" />
          <span style={{ fontWeight: 800, fontSize: 13, letterSpacing: '-0.5px', textTransform: 'uppercase' }}>
            KeyShield
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Dot active={health?.litConnected} label="Lit" />
          {walletConnected ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Dot active label="Wallet" />
              {walletPubkey && (
                <span style={{ fontSize: 9, color: '#444', fontFamily: 'monospace' }}>
                  {walletPubkey.slice(0, 4)}…{walletPubkey.slice(-4)}
                </span>
              )}
              {!sessionSigsObtained && (
                <button
                  onClick={unlockVault}
                  disabled={unlocking}
                  title="Unlock Lit-encrypted keys with Phantom signing"
                  style={{
                    background: 'none', border: '1px solid #3a2000', color: '#ff9500',
                    padding: '3px 8px', borderRadius: 4, cursor: unlocking ? 'wait' : 'pointer',
                    fontSize: 9, fontWeight: 700,
                  }}
                >
                  {unlocking ? '…' : '🔒 Unlock'}
                </button>
              )}
              {sessionSigsObtained && (
                <span style={{ fontSize: 9, color: '#4caf50', fontWeight: 700 }}>🔓</span>
              )}
            </div>
          ) : (
            <button
              onClick={connectWallet}
              disabled={connecting}
              style={{
                background: '#ff6200', border: 'none', color: '#fff',
                padding: '4px 10px', borderRadius: 4, cursor: connecting ? 'wait' : 'pointer',
                fontSize: 10, fontWeight: 700,
              }}
            >
              {connecting ? '…' : 'Connect'}
            </button>
          )}
        </div>
      </header>

      {/* Tab bar */}
      <nav style={{ display: 'flex', borderBottom: '1px solid #222', flexShrink: 0 }}>
        {(['active', 'vault', 'settings'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1, padding: '10px 0', background: 'none', border: 'none',
              borderBottom: tab === t ? '2px solid #ff6200' : '2px solid transparent',
              color: tab === t ? '#fff' : '#555', cursor: 'pointer',
              fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px',
            }}
          >
            {t === 'active' ? 'Active Tab' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {tab === 'active' && <ActiveTabPanel walletConnected={walletConnected} />}
        {tab === 'vault' && <VaultPanel sessionSigsObtained={sessionSigsObtained} onUnlock={unlockVault} />}
        {tab === 'settings' && <SettingsPanel />}
      </div>
    </div>
  );
}

// ── Active Tab Panel ──────────────────────────────────────────────────────────

function ActiveTabPanel({ walletConnected }: { walletConnected: boolean }) {
  const [detections, setDetections] = useState<DetectedKey[]>([]);
  const [rotations, setRotations] = useState<RotationAlert[]>([]);
  const [scanning, setScanning] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [storedIds, setStoredIds] = useState<Set<string>>(new Set());

  const scan = useCallback(() => {
    setScanning(true);
    setError(null);

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) { setScanning(false); setError('No active tab'); return; }

      // Inline detector: simplified regex scan injected into page
      chrome.scripting.executeScript(
        {
          target: { tabId: tab.id },
          func: inlineDetect,
        },
        (results) => {
          setScanning(false);
          if (chrome.runtime.lastError) {
            setError('Detection unavailable on this page');
            return;
          }
          const keys: DetectedKey[] = results?.[0]?.result ?? [];
          setDetections(keys);
        }
      );
    });
  }, []);

  // Scan on open
  useEffect(() => { scan(); }, [scan]);

  // Listen for rotation alerts from background
  useEffect(() => {
    const listener = (msg: { type: string; rotations?: RotationAlert[] }) => {
      if (msg.type === 'ROTATION_DETECTED' && msg.rotations) {
        setRotations((prev) => [...prev, ...msg.rotations!]);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const storeKey = (key: DetectedKey) => {
    chrome.runtime.sendMessage({ type: 'STORE_KEY', key }, (res) => {
      if (res?.success) {
        setStoredIds((prev) => new Set([...prev, `${key.provider}:${key.domain}`]));
        setDetections((prev) => prev.filter(
          (k) => !(k.provider === key.provider && k.domain === key.domain)
        ));
      } else {
        alert(res?.error || 'Failed to store key');
      }
    });
  };

  const updateVault = (rotation: RotationAlert) => {
    chrome.runtime.sendMessage(
      { type: 'UPDATE_VAULT_ENTRY', id: rotation.oldEntryId, key: rotation.newKey },
      (res) => {
        if (res?.success) {
          setRotations((prev) => prev.filter(
            (r) => !(r.provider === rotation.provider && r.domain === rotation.domain)
          ));
        } else {
          alert(res?.error || 'Failed to update vault');
        }
      }
    );
  };

  if (scanning) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: '#555' }}>
        <Spinner />
        <p style={{ marginTop: 12, fontSize: 12 }}>Scanning page...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <p style={{ color: '#555', fontSize: 12, marginBottom: 12 }}>{error}</p>
        <SmallButton onClick={scan}>Try again</SmallButton>
      </div>
    );
  }

  const total = detections.length + rotations.length;

  return (
    <div style={{ padding: '12px 0' }}>
      {/* Summary row */}
      <div style={{
        padding: '0 16px 10px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{ color: '#555', fontSize: 11 }}>
          {total === 0 ? 'No keys detected' : `${total} key${total !== 1 ? 's' : ''} detected`}
        </span>
        <SmallButton onClick={scan}>↻ Rescan</SmallButton>
      </div>

      {/* Rotation alerts */}
      {rotations.map((r, i) => (
        <div key={i} style={{
          margin: '0 12px 8px', padding: 12,
          background: '#1a1200', border: '1px solid #4a3200', borderRadius: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{ color: '#ff9500', fontSize: 11, fontWeight: 700 }}>⚠ KEY ROTATED</span>
            <span style={{ color: '#888', fontSize: 10 }}>{r.provider} · {r.domain}</span>
          </div>
          <p style={{ color: '#999', fontSize: 11, marginBottom: 8 }}>
            A new {r.provider} key was detected. Update your vault?
          </p>
          <div style={{ display: 'flex', gap: 6 }}>
            <ActionButton onClick={() => updateVault(r)}>Update Vault</ActionButton>
            <SmallButton onClick={() => setRotations((prev) => prev.filter((_, j) => j !== i))}>
              Keep old
            </SmallButton>
          </div>
        </div>
      ))}

      {/* Detection cards */}
      {detections.length === 0 && rotations.length === 0 && (
        <div style={{ padding: '24px 16px', textAlign: 'center', color: '#444', fontSize: 12 }}>
          No API keys found on this page.
          <br />
          <span style={{ color: '#333', fontSize: 11 }}>
            Keys in forms, headers, or code blocks will appear here.
          </span>
        </div>
      )}

      {detections.map((key, i) => {
        const uid = `${key.provider}:${key.domain}`;
        const stored = storedIds.has(uid);
        return (
          <div key={i} style={{
            margin: '0 12px 8px', padding: 12,
            background: '#161616', border: '1px solid #222', borderRadius: 8,
          }}>
            {/* Provider + confidence */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ShieldIcon size={12} color="#ff6200" />
                <span style={{ fontWeight: 700, fontSize: 12 }}>{key.provider || 'API Key'}</span>
              </div>
              <ConfidenceBadge confidence={key.confidence} />
            </div>

            {/* Key preview */}
            <div style={{
              fontFamily: 'monospace', fontSize: 10, color: '#666',
              background: '#0d0d0d', padding: '4px 8px', borderRadius: 4, marginBottom: 8,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {maskKey(key.key)}
            </div>

            {/* Domain */}
            <div style={{ fontSize: 10, color: '#444', marginBottom: 8 }}>
              Detected on: <span style={{ color: '#666' }}>{key.domain}</span>
            </div>

            {/* Action */}
            {stored ? (
              <div style={{ fontSize: 11, color: '#4caf50', fontWeight: 700 }}>✓ Stored in vault</div>
            ) : (
              <ActionButton
                disabled={!walletConnected}
                onClick={() => storeKey(key)}
                title={!walletConnected ? 'Connect wallet in Settings first' : ''}
              >
                {walletConnected ? 'Store in Vault' : 'Connect wallet first'}
              </ActionButton>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Inline key detection function injected into the active tab.
 * Bundled into popup.js by webpack. Must be self-contained (no imports).
 */
function inlineDetect(): Array<{
  key: string; provider?: string; domain: string; confidence: number; source: string; timestamp: number;
}> {
  const domain = window.location.hostname;
  const results: ReturnType<typeof inlineDetect> = [];
  const seen = new Set<string>();

  const patterns: Array<[RegExp, string, number]> = [
    [/sk-(?:(?:live|test|proj)_)?[A-Za-z0-9]{48,}/g, 'OpenAI', 98],
    [/sk-ant-api03-[A-Za-z0-9_-]{48,}/g, 'Anthropic', 98],
    [/AIza[0-9A-Za-z_-]{35}/g, 'Google Gemini', 90],
    [/gsk_[A-Za-z0-9_-]{48,}/g, 'Groq', 90],
    [/hf_[A-Za-z0-9_-]{34,}/g, 'HuggingFace', 85],
    [/pplx-[A-Za-z0-9_-]{32,}/g, 'Perplexity', 85],
    [/r8_[A-Za-z0-9_-]{32,}/g, 'Replicate', 85],
    [/sk_live_[A-Za-z0-9]{24,}/g, 'Stripe', 95],
    [/pk_live_[A-Za-z0-9]{24,}/g, 'Stripe (Public)', 90],
    [/ghp_[A-Za-z0-9]{36}/g, 'GitHub', 95],
    [/gho_[A-Za-z0-9]{36}/g, 'GitHub OAuth', 90],
    [/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g, 'Helius (UUID)', 70],
  ];

  // Scan visible text and input values
  const inputs = document.querySelectorAll('input, textarea');
  inputs.forEach((el) => {
    const val = (el as HTMLInputElement).value;
    if (!val || val.length < 16) return;
    patterns.forEach(([re, provider, confidence]) => {
      const matches = val.match(re);
      matches?.forEach((m) => {
        if (!seen.has(m)) {
          seen.add(m);
          results.push({ key: m, provider, domain, confidence, source: 'form', timestamp: Date.now() });
        }
      });
    });
  });

  // Scan page text (code blocks, pre elements)
  document.querySelectorAll('pre, code, .token').forEach((el) => {
    const text = el.textContent || '';
    patterns.forEach(([re, provider, confidence]) => {
      const matches = text.match(re);
      matches?.forEach((m) => {
        if (!seen.has(m)) {
          seen.add(m);
          results.push({ key: m, provider, domain, confidence: confidence - 10, source: 'dom', timestamp: Date.now() });
        }
      });
    });
  });

  return results;
}

// ── Vault Panel ───────────────────────────────────────────────────────────────

function VaultPanel({
  sessionSigsObtained,
  onUnlock,
}: {
  sessionSigsObtained: boolean;
  onUnlock: () => void;
}) {
  const [items, setItems] = useState<VaultEntry[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_VAULT_ITEMS' }, (res) => {
      setLoading(false);
      if (res?.items) setItems(res.items);
    });
  }, []);

  const filtered = items.filter(
    (i) =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.provider.toLowerCase().includes(search.toLowerCase()) ||
      i.domain.toLowerCase().includes(search.toLowerCase())
  );

  // A Lit-encrypted key needs session sigs; local: AES keys do not
  const needsUnlock = (item: VaultEntry) => item.encrypted && !sessionSigsObtained;

  const copyKey = (item: VaultEntry) => {
    if (needsUnlock(item)) {
      onUnlock();
      return;
    }
    chrome.runtime.sendMessage({ type: 'DECRYPT_KEY', id: item.id }, (res) => {
      if (res?.value) {
        navigator.clipboard.writeText(res.value).then(() => {
          setCopiedId(item.id);
          setTimeout(() => setCopiedId(null), 2000);
        });
      } else {
        alert(res?.error || 'Failed to decrypt key');
      }
    });
  };

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center', color: '#555' }}><Spinner /></div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Search */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #1a1a1a' }}>
        <input
          type="text"
          placeholder="Search vault..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%', background: '#161616', border: '1px solid #2a2a2a',
            color: '#fff', padding: '7px 10px', borderRadius: 6, fontSize: 12,
            outline: 'none',
          }}
        />
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: '#444', fontSize: 12 }}>
          {items.length === 0
            ? 'No keys stored yet.\nDetect and save keys from the Active Tab.'
            : 'No results for "' + search + '"'}
        </div>
      ) : (
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {filtered.map((item) => {
            const locked = needsUnlock(item);
            const copied = copiedId === item.id;
            return (
              <div
                key={item.id}
                style={{
                  padding: '10px 14px', borderBottom: '1px solid #1a1a1a',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                <ShieldIcon size={12} color={locked ? '#4a3000' : item.encrypted ? '#ff6200' : '#555'} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.name}
                  </div>
                  <div style={{ fontSize: 10, color: '#444', marginTop: 2 }}>
                    {item.provider} · {item.domain}
                    {item.domains.length > 1 && (
                      <span style={{ color: '#333' }}> + {item.domains.length - 1} more</span>
                    )}
                    {locked && (
                      <span style={{ color: '#4a3000', marginLeft: 4 }}>· Lit encrypted</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => copyKey(item)}
                  title={locked ? 'Click to unlock vault with Phantom' : `Copy ${item.name}`}
                  style={{
                    background: copied ? '#1a3a1a' : locked ? '#1a1200' : '#1e1e1e',
                    border: `1px solid ${copied ? '#2a4a2a' : locked ? '#3a2000' : '#2a2a2a'}`,
                    color: copied ? '#4caf50' : locked ? '#ff9500' : '#666',
                    padding: '5px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 10, fontWeight: 700,
                    flexShrink: 0,
                  }}
                  aria-label={locked ? `Unlock to copy ${item.name}` : `Copy ${item.name}`}
                >
                  {copied ? '✓ Copied' : locked ? '🔒 Unlock' : 'Copy'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Settings Panel ────────────────────────────────────────────────────────────

function SettingsPanel() {
  const [settings, setSettings] = useState<{
    litNetwork: string;
    autoPayThreshold: number;
    trustedDomains: string[];
    autoSaveEnabled: boolean;
  }>({
    litNetwork: 'datil-dev',
    autoPayThreshold: 0.01,
    trustedDomains: [],
    autoSaveEnabled: false,
  });
  const [saved, setSaved] = useState(false);
  const [newDomain, setNewDomain] = useState('');

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (res) => {
      if (res) setSettings((prev) => ({ ...prev, ...res }));
    });
  }, []);

  const save = (patch: Partial<typeof settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    chrome.runtime.sendMessage({ type: 'SET_SETTINGS', settings: next }, () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  };

  const removeTrusted = (domain: string) => {
    save({ trustedDomains: settings.trustedDomains.filter((d) => d !== domain) });
  };

  const addTrusted = () => {
    const d = newDomain.trim().replace(/^https?:\/\//, '').split('/')[0];
    if (d && !settings.trustedDomains.includes(d)) {
      save({ trustedDomains: [...settings.trustedDomains, d] });
      setNewDomain('');
    }
  };

  return (
    <div style={{ padding: 14, fontSize: 12 }}>
      {/* Lit Network */}
      <Section title="Lit Network">
        <select
          value={settings.litNetwork}
          onChange={(e) => save({ litNetwork: e.target.value })}
          style={{
            width: '100%', background: '#161616', border: '1px solid #2a2a2a',
            color: '#fff', padding: '7px 10px', borderRadius: 6, fontSize: 12,
          }}
        >
          <option value="datil-dev">datil-dev (development)</option>
          <option value="datil">datil (testnet)</option>
          <option value="habanero">habanero (mainnet)</option>
        </select>
      </Section>

      {/* Auto-pay */}
      <Section title="x402 Auto-Pay">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: '#ccc' }}>
          <input
            type="checkbox"
            checked={settings.autoSaveEnabled}
            onChange={(e) => save({ autoSaveEnabled: e.target.checked })}
          />
          Auto-pay on trusted domains
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#888' }}>Max amount:</span>
          <input
            type="number"
            step="0.001"
            min="0"
            max="1"
            value={settings.autoPayThreshold}
            onChange={(e) => save({ autoPayThreshold: parseFloat(e.target.value) || 0 })}
            style={{
              width: 70, background: '#161616', border: '1px solid #2a2a2a',
              color: '#fff', padding: '5px 8px', borderRadius: 4, fontSize: 12,
            }}
          />
          <span style={{ color: '#888' }}>USDC</span>
        </div>
      </Section>

      {/* Trusted domains */}
      <Section title="Trusted Domains">
        {settings.trustedDomains.length === 0 && (
          <p style={{ color: '#444', marginBottom: 8 }}>No trusted domains yet.</p>
        )}
        {settings.trustedDomains.map((d) => (
          <div key={d} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '4px 0', borderBottom: '1px solid #1a1a1a',
          }}>
            <span style={{ color: '#888' }}>{d}</span>
            <button
              onClick={() => removeTrusted(d)}
              style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 13 }}
              aria-label={`Remove ${d}`}
            >×</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input
            type="text"
            placeholder="example.com"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTrusted()}
            style={{
              flex: 1, background: '#161616', border: '1px solid #2a2a2a',
              color: '#fff', padding: '6px 8px', borderRadius: 4, fontSize: 11,
            }}
          />
          <SmallButton onClick={addTrusted}>Add</SmallButton>
        </div>
      </Section>

      {saved && (
        <div style={{ textAlign: 'center', color: '#4caf50', fontSize: 11, marginTop: 8 }}>
          ✓ Saved
        </div>
      )}
    </div>
  );
}

// ── Shared Components ─────────────────────────────────────────────────────────

function ShieldIcon({ size = 16, color = '#ff6200' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function Dot({ active, label }: { active?: boolean; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      <div style={{
        width: 6, height: 6, borderRadius: '50%',
        background: active ? '#4caf50' : '#333',
      }} />
      <span style={{ fontSize: 9, color: '#444', textTransform: 'uppercase' }}>{label}</span>
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const color = confidence >= 90 ? '#4caf50' : confidence >= 70 ? '#ff9500' : '#666';
  return (
    <span style={{ fontSize: 10, color, fontWeight: 700 }}>
      {confidence}%
    </span>
  );
}

function Spinner() {
  const [angle, setAngle] = useState(0);
  const ref = useRef<number>(0);
  useEffect(() => {
    const tick = () => { setAngle((a) => a + 8); ref.current = requestAnimationFrame(tick); };
    ref.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(ref.current);
  }, []);
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" style={{ transform: `rotate(${angle}deg)` }}>
      <circle cx="12" cy="12" r="10" stroke="#2a2a2a" strokeWidth="3" fill="none" />
      <path d="M12 2 A10 10 0 0 1 22 12" stroke="#ff6200" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function ActionButton({
  children, onClick, disabled, title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        background: disabled ? '#1a1a1a' : '#ff6200',
        border: 'none', color: disabled ? '#444' : '#fff',
        padding: '7px 14px', borderRadius: 6, cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 11, fontWeight: 700,
      }}
    >
      {children}
    </button>
  );
}

function SmallButton({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: '#1e1e1e', border: '1px solid #2a2a2a', color: '#888',
        padding: '5px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 10, fontWeight: 700,
      }}
    >
      {children}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: '#444', textTransform: 'uppercase',
        letterSpacing: '0.8px', marginBottom: 8,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function maskKey(key: string): string {
  if (key.length <= 12) return '•'.repeat(key.length);
  return key.slice(0, 6) + '••••••••••••' + key.slice(-4);
}
