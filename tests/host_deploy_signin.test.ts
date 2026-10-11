import { describe, expect, it } from "vitest";
import {
  hostedDashboardHref,
  isLocalViteSigninHost,
  PROD_DASHBOARD_URL,
} from "../src/web/lib/host-deploy";

describe("hosted Sign-in bounce", () => {
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
});
