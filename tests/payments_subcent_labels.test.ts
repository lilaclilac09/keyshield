import { describe, expect, it } from "vitest";
import { formatUsd } from "../src/web/lib/shop-demo";
import { purchaseFromMppStream } from "../src/web/lib/purchases";

describe("payments sub-cent amounts", () => {
  it("does not round 0.003 USDC to $0.00", () => {
    expect(formatUsd(0.003)).toBe("$0.003");
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(2)).toBe("$2.00");
  });
});

describe("MPP stream settlement label", () => {
  it("labels a local-only settled stream as not on-chain", () => {
    const row = purchaseFromMppStream({ id: 1, settled_micro_usdc: 3000, on_chain_signature: null });
    expect(row?.txType).toBe("Local MPP stream (not on-chain)");
    expect(row?.callKind).toBe("API");
    expect(row?.railLabel).toBe("Local ledger · MPP (not on-chain)");
    expect(row?.portal).toBe("Local ledger · MPP portal (not on-chain)");
  });
  it("labels a stream with a settle signature as on-chain", () => {
    const row = purchaseFromMppStream({ id: 2, settled_micro_usdc: 3000, on_chain_signature: "5sig" });
    expect(row?.txType).toBe("On-chain MPP stream");
    expect(row?.callKind).toBe("on-chain tx");
    expect(row?.railLabel).toBe("Solana Devnet · MPP");
    expect(row?.portal).toBe("Solana Devnet · MPP portal");
  });
});
