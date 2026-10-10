/** Session MAC for MPP capture: HMAC-SHA256(token_utf8, artifact_hash_bytes). */

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase();
  if (clean.length !== 64 || /[^0-9a-f]/.test(clean)) {
    throw new Error('artifact hash must be 32-byte hex');
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export async function signArtifactMac(sessionToken: string, artifactHashHex: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(sessionToken),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, hexToBytes(artifactHashHex));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}
