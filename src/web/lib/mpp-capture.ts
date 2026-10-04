/** Session MAC for POST /mpp/streams/{id}/capture. Matches capture.py. */

function hexToBytes(hex: string): Uint8Array {
  const text = hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
  if (text.length !== 64) throw new Error('artifact hash must be 32 bytes hex');
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(text.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
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
