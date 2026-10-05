/** Session MAC for POST /mpp/streams/{id}/capture. Matches capture.py. */

export function bytesToHex(buf: ArrayBuffer | Uint8Array): string {
  const arr = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return [...arr].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const text = hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
  if (text.length !== 64) throw new Error('artifact hash must be 32 bytes hex');
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(text.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function signCaptureMac(sessionToken: string, artifactHex: string): Promise<string> {
  if (!sessionToken) throw new Error('session token required');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(sessionToken),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, hexToBytes(artifactHex));
  return bytesToHex(mac);
}

export async function signOwnerBinding(
  signMessage: (msg: Uint8Array) => Promise<Uint8Array>,
  bindingHashHex: string,
): Promise<string> {
  const sig = await signMessage(hexToBytes(bindingHashHex));
  return bytesToHex(sig);
}
