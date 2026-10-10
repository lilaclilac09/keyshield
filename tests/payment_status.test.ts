import { describe, expect, it } from "vitest";
import { normalizeSettleMode } from "../src/web/lib/payment-status";

describe("normalizeSettleMode", () => {
  it("never paints cost_usd as submitted / paid", () => {
    expect(normalizeSettleMode({ cost_usd: 0.02 })).toBe("stub");
    expect(normalizeSettleMode({ payment_status: "paid", cost_usd: 1 })).toBe("stub");
  });

  it("trusts server settle_mode", () => {
    expect(normalizeSettleMode({ settle_mode: "submitted", cost_usd: 0 })).toBe("submitted");
    expect(normalizeSettleMode({ settle_mode: "held" })).toBe("held");
    expect(normalizeSettleMode({ settle_mode: "captured" })).toBe("captured");
    expect(normalizeSettleMode({ settle_mode: "failed" })).toBe("failed");
  });

  it("maps 4xx/5xx to failed", () => {
    expect(normalizeSettleMode({ status_code: 402, cost_usd: 1 })).toBe("failed");
  });

  it("zero-cost without a mode is held, not green", () => {
    expect(normalizeSettleMode({ cost_usd: 0, status_code: 200 })).toBe("held");
  });
});
