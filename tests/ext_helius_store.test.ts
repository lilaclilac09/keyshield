import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Backend /manage/store answers 400 "Paste the API key" to a cipher-only
// body. The extension's store path must keep sending the plaintext key.
describe("extension Helius store path", () => {
  const bg = readFileSync("src/extension/background.js", "utf8");
  const start = bg.indexOf("async function directStore(");
  const end = bg.indexOf("\n}\n", start);
  const directStore = bg.slice(start, end);

  it("directStore posts plaintext apiKey + value to /manage/store", () => {
    expect(directStore).toContain("/manage/store");
    expect(directStore).toMatch(/apiKey:\s*String\(value/);
    expect(directStore).toMatch(/value:\s*String\(value/);
    expect(directStore).not.toMatch(/cipher_v/);
  });

  it("content.js bulk save sends the full detected key for Helius UUIDs", () => {
    const content = readFileSync("src/extension/content.js", "utf8");
    expect(content).toMatch(/id:\s*'helius'/);
    expect(content).toMatch(/type:\s*'SAVE_KEY'[\s\S]{0,400}value:\s*key,/);
  });
});
