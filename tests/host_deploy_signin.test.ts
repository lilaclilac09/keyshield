import { describe, expect, it } from "vitest";
import {
  hostedDashboardHref,
  isLocalViteSigninHost,
  PROD_DASHBOARD_URL,
  signinDashboardHref,
  PROD_API_BASE,
  isLegacyBakedUrl,
  usePublicControlPlaneFallback,
} from "../src/web/lib/host-deploy";

describe("hosted Sign-in bounce", () => {
  it("uses the canonical API and does not classify it as an obsolete host", () => {
    expect(PROD_API_BASE).toBe("https://api.ks.aileena.xyz");
    expect(isLegacyBakedUrl(PROD_API_BASE)).toBe(false);
    expect(usePublicControlPlaneFallback("app.ks.aileena.xyz", PROD_API_BASE)).toBe(false);
    expect(usePublicControlPlaneFallback("app.ks.aileena.xyz", "")).toBe(true);
    expect(usePublicControlPlaneFallback("app.ks.aileena.xyz", "http://127.0.0.1:8001")).toBe(true);
    expect(usePublicControlPlaneFallback("localhost", "http://127.0.0.1:8001")).toBe(false);
    expect(isLegacyBakedUrl("https://sync.ks.aileena.xyz")).toBe(true);
  });
  it("keeps 127.0.0.1:5173 as a login tab that must redirect", () => {
    expect(
      isLocalViteSigninHost({
        hostname: "127.0.0.1",
        port: "5173",
        pathname: "/",
        search: "",
        hash: "",
      }),
    ).toBe(true);
  });

  it("does not bounce ?local=1 UI clones", () => {
    expect(
      isLocalViteSigninHost({
        hostname: "127.0.0.1",
        port: "5173",
        pathname: "/",
        search: "?local=1",
        hash: "",
      }),
    ).toBe(false);
  });

  it("rewrites the login tab to app.ks.aileena.xyz", () => {
    expect(PROD_DASHBOARD_URL).toBe("https://app.ks.aileena.xyz");
    expect(
      hostedDashboardHref({
        hostname: "127.0.0.1",
        port: "5173",
        pathname: "/",
        search: "",
        hash: "",
      }),
    ).toBe("https://app.ks.aileena.xyz/");
  });

  it("marks Sign-in with ext=1 so the extension session restores", () => {
    expect(signinDashboardHref()).toBe("https://app.ks.aileena.xyz/?ext=1");
  });
});
