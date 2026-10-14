import { describe, expect, it } from "vitest";
import {
  groupPurchasesByRoleAndWallet,
  ledgerPurchaseRow,
  purchaseFromMppStream,
} from "../src/web/lib/purchases";

describe("Payments Agent section shows a local agent's stream", () => {
  it("keeps a metered but not-yet-captured local agent stream", () => {
    // Shape /mpp/streams returns after an agent's calls are recorded locally.
    const row = purchaseFromMppStream({
      id: 1,
      agent_name: "local-agent",
      agent_pubkey: "AgentPub111",
      settled_micro_usdc: 0,
      pending_micro_usdc: 1000,
      total_calls: 1,
      on_chain_signature: null,
    });
    expect(row).not.toBeNull();
    expect(row?.walletRole).toBe("agent");
    expect(row?.amountLabel).toBe("0.001000 USDC pending");
    expect(row?.txType).toContain("not on-chain");
    const agent = groupPurchasesByRoleAndWallet(row ? [row] : []).find((g) => g.role === "agent");
    expect(agent?.wallets.length).toBe(1);
  });
  it("still drops a stream with no calls and no money", () => {
    expect(purchaseFromMppStream({ id: 2, settled_micro_usdc: 0, total_calls: 0 })).toBeNull();
  });
});

describe("Ledger wallet header", () => {
  it("does not repeat 'Ledger · no chain wallet'", () => {
    const row = ledgerPurchaseRow({ id: "ledger-1", name: "Credit", amountUsd: 2, at: 0 });
    const ledger = groupPurchasesByRoleAndWallet([row]).find((g) => g.role === "ledger");
    const w = ledger!.wallets[0];
    const header = `${w.walletLabel}${w.walletAddress ? ` · ${w.walletAddress}` : ""}`;
    expect(header).toBe("Ledger · no chain wallet");
  });
});
