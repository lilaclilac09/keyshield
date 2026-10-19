import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";

const bg = readFileSync("src/extension/background.js", "utf8");
const vec = JSON.parse(readFileSync("docs/zk/vectors.json", "utf8"));

function fn(name: string): string {
  const i = bg.search(new RegExp(`(async )?function ${name}\\(`));
  if (i < 0) throw new Error(`missing ${name}`);
  return bg.slice(i, bg.indexOf("\n}\n", i) + 2);
}

// Evaluate the extension's own zk-v1 helpers against the spec vectors.
const helpers = new Function(
  "crypto",
  [fn("_zkB64u"), fn("_zkUnb64u"), fn("zkRootId"), fn("_zkItemKey"), fn("_zkHint"),
    "return { _zkB64u, _zkUnb64u, zkRootId, _zkItemKey, _zkHint };"].join("\n"),
)(webcrypto);

describe("extension zk-v1", () => {
  it("root id matches the vector", async () => {
    expect(await helpers.zkRootId(helpers._zkUnb64u(vec.root))).toBe(vec.root_id);
  });

  it("item key decrypts the vector ciphertext", async () => {
    const root = await webcrypto.subtle.importKey("raw", helpers._zkUnb64u(vec.root), "HKDF", false, ["deriveBits"]);
    const key = await helpers._zkItemKey(root, helpers._zkUnb64u(vec.share), vec.item_id, vec.upstream);
    const pt = await webcrypto.subtle.decrypt(
      { name: "AES-GCM", iv: helpers._zkUnb64u(vec.iv), additionalData: new TextEncoder().encode(vec.aad) },
      key,
      helpers._zkUnb64u(vec.cipher),
    );
    expect(new TextDecoder().decode(pt)).toBe(vec.plaintext);
  });

  it("hint is only a public prefix", () => {
    expect(helpers._zkHint("sk-proj-abcdef1234567890")).toBe("sk-proj-");
    expect(helpers._zkHint("0f3c2a10-1111-2222-3333-444455556666")).toBe("");
  });

  it("raw pending keys never go to chrome.storage.local", () => {
    const writes = [...bg.matchAll(/chrome\.storage\.local\.set\(\{([^}]*)\}/g)].map((m) => m[1]);
    for (const w of writes) expect(w).not.toMatch(/ks_pending_vault/);
    expect(fn("_pendingStore")).toMatch(/storage\.session\) \|\| null/);
    expect(fn("_writePendingRows")).toMatch(/_pendingStore\(\)/);
    expect(fn("queuePendingVault")).toMatch(/zkState/);
  });
});
