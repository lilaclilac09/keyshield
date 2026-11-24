import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { createRequire } from 'node:module';

const requireDesktop = createRequire(new URL('../src/desktop/package.json', import.meta.url));
const { isoCBOR } = requireDesktop('@simplewebauthn/server/helpers');
export const ORIGIN = 'https://app.ks.aileena.xyz';
export const RP_ID = 'app.ks.aileena.xyz';
const hash = (value: Buffer | string) => createHash('sha256').update(value).digest();

export function softwarePasskey() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  const id = randomBytes(32);
  const cose = isoCBOR.encode(new Map([
    [1, 2], [3, -7], [-1, 1], [-2, new Uint8Array(Buffer.from(jwk.x!, 'base64url'))],
    [-3, new Uint8Array(Buffer.from(jwk.y!, 'base64url'))],
  ]));
  let counter = 0;
  function authData(flags: number, count: number) {
    const data = Buffer.alloc(37);
    hash(RP_ID).copy(data);
    data[32] = flags;
    data.writeUInt32BE(count, 33);
    return data;
  }
  return {
    id: id.toString('base64url'),
    registration(challenge: string, options: { origin?: string; uv?: boolean; prf?: boolean } = {}) {
      const client = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge, origin: options.origin ?? ORIGIN }));
      const length = Buffer.alloc(2); length.writeUInt16BE(id.length);
      const data = Buffer.concat([authData(options.uv === false ? 0x41 : 0x45, 0), Buffer.alloc(16), length, id, cose]);
      return { id: id.toString('base64url'), rawId: id.toString('base64url'), type: 'public-key', clientExtensionResults: { prf: { enabled: options.prf !== false } },
        response: { clientDataJSON: client.toString('base64url'), attestationObject: Buffer.from(isoCBOR.encode(new Map([
          ['fmt', 'none'], ['attStmt', new Map()], ['authData', new Uint8Array(data)],
        ]))).toString('base64url'), transports: ['internal'] } };
    },
    assertion(challenge: string, options: { origin?: string; uv?: boolean; counter?: number } = {}) {
      const client = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin: options.origin ?? ORIGIN }));
      const data = authData(options.uv === false ? 1 : 5, options.counter ?? ++counter);
      const signature = sign('sha256', Buffer.concat([data, hash(client)]), privateKey);
      return { id: id.toString('base64url'), rawId: id.toString('base64url'), type: 'public-key', clientExtensionResults: {},
        response: { authenticatorData: data.toString('base64url'), clientDataJSON: client.toString('base64url'),
          signature: signature.toString('base64url') } };
    },
  };
}
