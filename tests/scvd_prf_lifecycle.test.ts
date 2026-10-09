import { describe, expect, it, beforeEach } from "vitest";
import {
  acquireSignatureNonce,
  inFlightSignatureCount,
  releaseSignatureNonce,
  resetSignatureNonces,
  wipeArrayBuffer,
  wipeBytes,
  importAesGcmAndWipe,
} from "../src/web/lib/prf-wipe";
import { deriveMasterKey, deriveVaultId, encryptVault, emptyVault } from "../src/web/lib/vault";
import {
  clearExtensionVaultKey,
  deriveExtensionVaultKey,
} from "../src/web/lib/vault-key";

describe("SCVD-2 volatile memory & WebAuthn PRF derivation", () => {
  beforeEach(() => {
    resetSignatureNonces();
  });

  it("wipes intermediate HKDF bits after AES-GCM import", async () => {
    const bits = new Uint8Array(32);
    crypto.getRandomValues(bits);
    const copy = bits.slice();
    const key = await importAesGcmAndWipe(bits.buffer);
    expect(key.extractable).toBe(false);
    expect([...bits].every((b) => b === 0)).toBe(true);
    expect(copy.some((b) => b !== 0)).toBe(true);
    wipeBytes(copy);
    expect([...copy].every((b) => b === 0)).toBe(true);
  });

  it("deriveMasterKey leaves a non-extractable key and vault id does not embed PRF hex", async () => {
    const prf = new Uint8Array(32);
    crypto.getRandomValues(prf);
    const key = await deriveMasterKey(prf.buffer);
    expect(key.type).toBe("secret");
    expect(key.extractable).toBe(false);
    const vaultId = await deriveVaultId(prf.buffer);
    expect(vaultId).toMatch(/^[0-9a-f]{32}$/);
    const hex = [...prf].map((b) => b.toString(16).padStart(2, "0")).join("");
    expect(vaultId.includes(hex)).toBe(false);
    const cipher = await encryptVault(key, emptyVault());
    expect(cipher.ciphertext.length).toBeGreaterThan(16);
  });

  it("wipes caller-owned signature material after extension HKDF", async () => {
    const sig = new Uint8Array(64);
    crypto.getRandomValues(sig);
    const first = await deriveExtensionVaultKey(sig);
    expect(first.length).toBeGreaterThan(20);
    expect([...sig].every((b) => b === 0)).toBe(true);
    wipeArrayBuffer(new ArrayBuffer(8));
    clearExtensionVaultKey();
  });

  it("refuses concurrent signature requests for the same context anchor", () => {
    const anchor = "ctx-open-stream-1";
    const nonce = acquireSignatureNonce(anchor);
    expect(nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(inFlightSignatureCount()).toBe(1);
    expect(() => acquireSignatureNonce(anchor)).toThrow(/concurrent signature/);
    releaseSignatureNonce(anchor);
    const again = acquireSignatureNonce(anchor);
    expect(again).not.toBe(nonce);
    releaseSignatureNonce(anchor);
    expect(inFlightSignatureCount()).toBe(0);
  });

  it("wipes a buffer across an async failure boundary", async () => {
    const secret = new Uint8Array([9, 8, 7, 6]);
    await (async () => {
      try {
        throw new Error("signing failed");
      } finally {
        wipeBytes(secret);
      }
    })().catch(() => undefined);
    expect([...secret]).toEqual([0, 0, 0, 0]);
  });
});
