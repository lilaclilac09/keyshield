import { describe, expect, it } from "vitest";
import { feedbackVisibleMs, humanActionError } from "../src/web/lib/human-usable";

describe("human-usable ux helpers", () => {
  it("uses deterministic feedback visibility timings", () => {
    expect(feedbackVisibleMs("success")).toBe(6500);
    expect(feedbackVisibleMs("info")).toBe(5000);
    expect(feedbackVisibleMs("error")).toBe(9000);
    expect(feedbackVisibleMs("busy")).toBe(12000);
  });

  it("maps passkey interruption to actionable next steps", () => {
    const detail = humanActionError("passkey-signin", "NotAllowedError: operation cancelled by user");
    expect(detail).toContain("Passkey prompt was interrupted or cancelled.");
    expect(detail).toContain("Next step:");
  });

  it("maps vault save gates to actionable copy", () => {
    expect(humanActionError("vault-save", "Paste a key first")).toContain("Paste an API key first.");
    expect(humanActionError("vault-save", "Unrecognized key format.")).toContain("including prefix");
  });

  it("maps wallet cancellation to actionable retry", () => {
    const detail = humanActionError("wallet-connect", "User rejected request");
    expect(detail).toContain("Wallet request was cancelled.");
    expect(detail).toContain("Next step:");
  });
});
