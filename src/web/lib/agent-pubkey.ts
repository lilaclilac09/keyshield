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

/** Encode bytes as Bitcoin-style base58 (no 0/O/I/l). */
export function b58Encode(bytes: Uint8Array): string {
  let n = BigInt('0x' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join(''));
  let res = '';
  while (n > 0n) {
    const r = Number(n % 58n);
    n /= 58n;
    res = B58[r] + res;
  }
  let pad = 0;
  for (const b of bytes) {
    if (b !== 0) break;
    pad += 1;
  }
  return '1'.repeat(pad) + res;
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

export type AgentKeypair = {
  publicKeyB58: string;
  seedB64: string;
  privateKey: CryptoKey;
};

/** Browser ed25519 keypair for agent self-register + challenge login. */
export async function generateAgentKeypair(): Promise<AgentKeypair> {
  const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey));
  const pubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const seed = pkcs8.slice(pkcs8.length - 32);
  return {
    publicKeyB58: b58Encode(pubRaw),
    seedB64: btoa(String.fromCharCode(...seed)),
    privateKey: kp.privateKey,
  };
}

export async function signAgentChallenge(privateKey: CryptoKey, challenge: string): Promise<string> {
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: 'Ed25519' }, privateKey, new TextEncoder().encode(challenge)),
  );
  return btoa(String.fromCharCode(...sig));
}
