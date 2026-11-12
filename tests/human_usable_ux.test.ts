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
    expect(humanActionError("vault-save", "insufficient_scope")).toContain("cannot write the vault");
  });

  it("maps wallet cancellation to actionable retry", () => {
    const detail = humanActionError("wallet-connect", "User rejected request");
    expect(detail).toContain("Wallet request was cancelled.");
    expect(detail).toContain("Next step:");
  });

  it("never maps missing Google secrets to the password-fallback warning", () => {
    for (const raw of [
      "Live Google OAuth is not configured on this server.",
      "GOOGLE_NOT_CONFIGURED",
      "503",
      "GOOGLE_CLIENT_ID missing",
    ]) {
      const detail = humanActionError("google-auth", raw);
      expect(detail).not.toContain("Live Google OAuth is not configured");
      expect(detail).not.toMatch(/enter your Gmail/i);
      expect(detail).not.toMatch(/Create account/i);
    }
  });
});
