import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/web/lib/auth", () => ({ apiFetch: vi.fn() }));
import { deriveZkRoot, zkRootId, sealZk, openZk, unb64u, b64u, unlockCode } from "../src/web/lib/zk";

const vec = JSON.parse(readFileSync("docs/zk/vectors.json", "utf8"));

describe("web zk-v1", () => {
  it("derives the vector root and root id from the PRF output", async () => {
    const root = await deriveZkRoot(unb64u(vec.prf_output).buffer);
    expect(b64u(root)).toBe(vec.root);
    expect(await zkRootId(root)).toBe(vec.root_id);
    expect(unlockCode(root)).toBe(`ksz1.${vec.root}`);
  });

  it("opens the vector and round-trips a fresh seal", async () => {
    const root = unb64u(vec.root);
    const pt = await openZk(root, unb64u(vec.share), { id: vec.item_id, upstream: vec.upstream, iv: vec.iv, cipher: vec.cipher });
    expect(pt).toBe(vec.plaintext);
    const body = await sealZk(root, "openai", "sk-proj-test-not-real");
    expect(body.cipher_v).toBe(2);
    expect(JSON.stringify(body)).not.toContain("sk-proj-test-not-real");
    expect(body.id).toMatch(/^ks_[a-f0-9]{12}$/);
    expect(await openZk(root, unb64u(body.share), body)).toBe("sk-proj-test-not-real");
  });
});
