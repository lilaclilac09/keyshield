import { describe, expect, it } from "vitest";
import {
  BAZAAR_OFFERS,
  CIRCLE_DEVNET_USDC,
  SOLANA_DEVNET_CAIP,
  classifyX402Accepts,
  decodePaymentRequiredHeader,
  microFromAccept,
} from "../src/web/lib/x402-bazaar";

describe("x402 bazaar classify", () => {
  it("marks Crypto Regime as LIVE Solana Devnet Circle USDC", () => {
    const row = classifyX402Accepts([
      {
        network: SOLANA_DEVNET_CAIP,
        asset: CIRCLE_DEVNET_USDC,
        amount: "20000",
        payTo: "9ScHv3yEJcNj32ctNtPEuGyp1UHPvPFNn1rtsVxcCcY5",
      },
    ]);
    expect(row.status).toBe("LIVE");
    expect(row.micro).toBe(20_000);
    expect(microFromAccept(row.live || {})).toBe(20_000);
  });

  it("does not surface Quicknode Base USDC as a Solana Devnet buy", () => {
    const row = classifyX402Accepts([
      {
        network: "eip155:84532",
        asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        amount: "1000000",
      },
    ]);
    expect(row.status).toBe("NOT_SURFACE");
    expect(row.reason).toMatch(/Base/i);
  });

  it("does not surface a Solana mint that is not Circle Devnet USDC", () => {
    const row = classifyX402Accepts([
      {
        network: SOLANA_DEVNET_CAIP,
        asset: "HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr",
        amount: "5000",
      },
    ]);
    expect(row.status).toBe("NOT_SURFACE");
  });

  it("decodes PAYMENT-REQUIRED base64 and the v1 flag", () => {
    expect(decodePaymentRequiredHeader("x402")).toEqual({ x402: true });
    const payload = Buffer.from(JSON.stringify({
      x402Version: 2,
      accepts: [{ amount: "20000", network: SOLANA_DEVNET_CAIP }],
    })).toString("base64");
    const decoded = decodePaymentRequiredHeader(payload) as { x402Version: number };
    expect(decoded.x402Version).toBe(2);
  });

  it("catalog is honest: one LIVE API, Quicknode NOT_SURFACE, no token ticker", () => {
    expect(BAZAAR_OFFERS.find((o) => o.id === "crypto-regime")?.status).toBe("LIVE");
    expect(BAZAAR_OFFERS.find((o) => o.id === "quicknode")?.status).toBe("NOT_SURFACE");
    expect(JSON.stringify(BAZAAR_OFFERS)).toContain("Not a KeyShield SKU");
    expect(BAZAAR_OFFERS.filter((o) => o.status === "LIVE").map((o) => o.id)).toEqual([
      "crypto-regime",
      "payai",
    ]);
  });
});
