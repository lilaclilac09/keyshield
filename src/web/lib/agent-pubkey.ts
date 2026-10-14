const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Decode base58; returns null on any non-alphabet character. */
export function b58Decode(s: string): Uint8Array | null {
  let n = 0n;
  for (const ch of s) {
    const i = B58.indexOf(ch);
    if (i < 0) return null;
    n = n * 58n + BigInt(i);
  }
  const bytes: number[] = [];
  while (n > 0n) { bytes.unshift(Number(n % 256n)); n /= 256n; }
  let lead = 0;
  while (lead < s.length && s[lead] === '1') lead++;
  return new Uint8Array([...new Array(lead).fill(0), ...bytes]);
}

/** Error text for an invalid ed25519 pubkey, or '' if it is a valid 32-byte base58 key. */
export function agentPubkeyError(pubkey: string): string {
  const s = pubkey.trim();
  if (!s) return 'Paste the agent public key';
  const bytes = b58Decode(s);
  if (!bytes) return 'Not base58 (no 0, O, I or l; no spaces)';
  if (bytes.length !== 32) return `Ed25519 public key must decode to 32 bytes (got ${bytes.length})`;
  return '';
}
