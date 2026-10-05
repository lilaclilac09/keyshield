/**
 * Permission / trust boundaries. Labels only — never claim more than the
 * demo actually verifies.
 */

export const TRUST = {
  passkeyLayer: 'client-layer' as const,
  passkeyNote: 'WebAuthn PRF on-device — not Solana-native P-256 verify',
  proofKind: 'scaffold-sha256' as const,
  proofNote: 'Simulated / Scaffold — Groth16 VK not installed, fail-closed',
  apiKeyNote: 'plaintext only in X-Upstream-API-Key on /proxy/{upstream}/ — never logs or localStorage',
  walletNote: 'session keypair only — never master mnemonic or main wallet secret',
};

const MNEMONIC_LEN = new Set([12, 15, 18, 21, 24]);

/** True when the blob looks like a master wallet secret. Never persist those. */
export function isMasterWalletMaterial(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const words = trimmed.split(/\s+/);
  if (MNEMONIC_LEN.has(words.length) && words.every((w) => /^[a-z]+$/.test(w))) return true;
  if (/^\s*\[\s*\d+(?:\s*,\s*\d+){31,}\s*\]\s*$/.test(trimmed)) return true;
  if (/^[1-9A-HJ-NP-Za-km-z]{87,88}$/.test(trimmed)) return true;
  return false;
}

export function sessionKeyLabel(agentId: string, vaultId: string): string {
  return `ks-session-cred:${vaultId}:${agentId}`;
}
