import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("journey vault + payments brief", () => {
  const md = readFileSync(
    resolve(__dirname, "../docs/JOURNEY_VAULT_AND_PAYMENTS.md"),
    "utf8",
  );

  it("names the live receipt and the five extension saves", () => {
    expect(md).toContain("KS-MPP-509959477");
    expect(md).toContain("2.00 USDC MPP capture");
    expect(md).toContain("vault-demo-user");
    for (const up of ["openai", "anthropic", "openrouter", "groq", "helius"]) {
      expect(md).toContain(up);
    }
  });

  it("says what to present and what not to invent", () => {
    expect(md).toContain("ix **26**");
    expect(md).toContain("Not a KeyShield SKU");
    expect(md).toContain("Do not present");
    expect(md).toContain("ok 1.2.4 <all_urls>");
    expect(md).toContain("crypto-regime-api.onrender.com");
    expect(md).toContain("NOT SURFACE");
  });
});
