import { describe, expect, it } from "vitest";
import {
  SHOP_CREDIT_USD,
  describeBalanceChange,
  describeRpcPing,
  formatUsd,
  wantsShopDemo,
} from "../src/web/lib/shop-demo";

describe("shop demo helpers", () => {
  it("recognizes the extension Sign-in shop landing", () => {
    expect(wantsShopDemo("?ext=1&demo=shop")).toBe(true);
    expect(wantsShopDemo("ext=1")).toBe(false);
    expect(SHOP_CREDIT_USD).toBe(0.1);
  });

  it("formats a credit balance change", () => {
    const row = describeBalanceChange(1, 1.1);
    expect(row.delta).toBeCloseTo(0.1);
    expect(row.label).toContain("$1.00 → $1.10");
    expect(formatUsd(0)).toBe("$0.00");
  });

  it("describes an accelerated second RPC read", () => {
    expect(describeRpcPing(80, 8, "HIT", "helius-cache")).toBe(
      "1st 80ms · 2nd 8ms · faster · cache HIT · helius-cache",
    );
  });
});
