import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  extractPageKeyRecords,
  labelForDetectedKey,
  looksLikePageKeyName,
  uniquifyVaultName,
} from "../src/web/lib/page-key-labels";

describe("page key labels", () => {
  const table = [
    "Name",
    "API Key",
    "Panthermaze",
    "10470584-****-****-****-************",
    "Heronplanet",
    "ba5bbc06-****-****-****-************",
  ].join("\n");

  it("reads Helius dashboard names next to masked keys", () => {
    const rows = extractPageKeyRecords(table);
    expect(rows.map((r) => r.name)).toEqual(["Panthermaze", "Heronplanet"]);
    expect(labelForDetectedKey("10470584-67a9-4abc-8def-123456787761", rows)).toBe("Panthermaze");
    expect(looksLikePageKeyName("Panthermaze")).toBe(true);
    expect(looksLikePageKeyName("helius key")).toBe(false);
  });

  it("numbers generic dupes helius1 helius2 and keeps original names", () => {
    expect(uniquifyVaultName("helius key", "helius", [])).toBe("helius1");
    expect(uniquifyVaultName("helius key", "helius", ["helius1"])).toBe("helius2");
    expect(uniquifyVaultName("Panthermaze", "helius", [])).toBe("Panthermaze");
    expect(uniquifyVaultName("Panthermaze", "helius", ["Panthermaze"])).toBe("Panthermaze 2");
  });

  it("content script harvests the same Name column", () => {
    const js = readFileSync(resolve(__dirname, "../src/extension/content.js"), "utf8");
    expect(js).toContain("ksCollectPageKeyRecords");
    expect(js).toContain("ksLooksLikePageKeyName");
    expect(js).not.toMatch(/[\u4e00-\u9fff]/);
  });
});
