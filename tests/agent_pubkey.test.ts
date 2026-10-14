import { describe, expect, it } from "vitest";
import { agentPubkeyError } from "../src/web/lib/agent-pubkey";

describe("agentPubkeyError", () => {
  it("accepts a 32-byte base58 ed25519 key", () => {
    expect(agentPubkeyError("GHpmxvrXbAfc5XWG7mPrJFqchWEQC6mc2hyStP5P4bhq")).toBe("");
    expect(agentPubkeyError("11111111111111111111111111111111")).toBe("");
  });
  it("rejects empty, non-base58, and wrong length", () => {
    expect(agentPubkeyError("")).toMatch(/Paste/);
    expect(agentPubkeyError("0OIl")).toMatch(/base58/);
    expect(agentPubkeyError("abc")).toMatch(/32 bytes/);
  });
});
