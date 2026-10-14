import { describe, expect, it } from "vitest";
import { quickPasteError } from "../src/web/lib/keychain";

describe("Vault quick-paste gate", () => {
  it("empty input asks for a key", () => {
    expect(quickPasteError("  ")).toBe("Paste a key first");
  });
  it("non-empty unrecognized text is not told to 'paste a key first'", () => {
    const msg = quickPasteError("sk-ant-LOCALONLY");
    expect(msg).not.toBe("Paste a key first");
    expect(msg).toMatch(/Unrecognized key format/);
  });
  it("real-shaped keys pass", () => {
    expect(quickPasteError(`sk-ant-api03-${"a".repeat(40)}`)).toBeNull();
    expect(quickPasteError("sk-or-v1-abcdefghijklmnop")).toBeNull();
  });
});
