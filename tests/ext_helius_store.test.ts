import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Without ZK mode, /manage/store needs the plaintext key (the hosted proxy
// injects it). With ZK mode on, directStore seals first (cipher_v=2).
describe("extension Helius store path", () => {
  const bg = readFileSync("src/extension/background.js", "utf8");
  const start = bg.indexOf("async function directStore(");
  const end = bg.indexOf("\n}\n", start);
  const directStore = bg.slice(start, end);

  it("directStore posts plaintext apiKey + value to /manage/store", () => {
    expect(directStore).toContain("/manage/store");
    expect(directStore).toMatch(/apiKey:\s*String\(value/);
    expect(directStore).toMatch(/value:\s*String\(value/);
    // ZK branch: sealed body, no raw value, no raw pending queue
    expect(directStore).toMatch(/zkSeal\(/);
    expect(bg).toMatch(/cipher_v:\s*2/);
  });

  it("content.js bulk save sends the full detected key for Helius UUIDs", () => {
    const content = readFileSync("src/extension/content.js", "utf8");
    expect(content).toMatch(/id:\s*'helius'/);
    expect(content).toMatch(/type:\s*'SAVE_KEY'[\s\S]{0,400}value:\s*key,/);
  });
});
