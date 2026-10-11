import { describe, expect, it } from "vitest";
import { mergeSessionSides, parseExtensionSession } from "../src/web/lib/ext-session";
import {
  hostedDashboardHref,
  PROD_DASHBOARD_URL,
  signinDashboardHref,
} from "../src/web/lib/host-deploy";

describe("mergeSessionSides", () => {
  it("prefers the page token and pushes when the extension is empty", () => {
    expect(mergeSessionSides({
      pageToken: "ksv2_page",
      pageUser: "wallet1",
      extensionToken: null,
      extensionUser: null,
    })).toEqual({
      token: "ksv2_page",
      user: "wallet1",
      applyToPage: false,
      pushToExtension: true,
    });
  });

  it("does not rewrite either side when tokens already match", () => {
    const merged = mergeSessionSides({
      pageToken: "ksv2_same",
      pageUser: "w",
      extensionToken: "ksv2_same",
      extensionUser: "w",
    });
    expect(merged?.applyToPage).toBe(false);
    expect(merged?.pushToExtension).toBe(false);
  });

  it("applies the extension token when the page has no session", () => {
    expect(mergeSessionSides({
      pageToken: null,
      pageUser: null,
      extensionToken: "ksv2_ext",
      extensionUser: "wallet2",
    })).toEqual({
      token: "ksv2_ext",
      user: "wallet2",
      applyToPage: true,
      pushToExtension: false,
    });
  });

  it("returns null when both sides are empty", () => {
    expect(mergeSessionSides({
      pageToken: "  ",
      pageUser: null,
      extensionToken: null,
      extensionUser: null,
    })).toBeNull();
  });
});

describe("parseExtensionSession", () => {
  it("reads __ks_ext_session from the content-script message", () => {
    expect(parseExtensionSession({
      __ks_ext_session: { token: " ksv2_x ", user: "abc" },
    })).toEqual({ token: "ksv2_x", user: "abc" });
  });

  it("rejects a missing or blank token", () => {
    expect(parseExtensionSession({ __ks_ext_session: { user: "abc" } })).toBeNull();
    expect(parseExtensionSession({ hello: 1 })).toBeNull();
  });
});

describe("signinDashboardHref", () => {
  it("opens the hosted dashboard already marked for extension restore", () => {
    expect(PROD_DASHBOARD_URL).toBe("https://app.ks.aileena.xyz");
    expect(signinDashboardHref()).toBe("https://app.ks.aileena.xyz/?ext=1");
  });

  it("keeps ext=1 when Vite bounces to the hosted Sign-in", () => {
    expect(hostedDashboardHref({
      hostname: "127.0.0.1",
      port: "5173",
      pathname: "/",
      search: "?ext=1",
      hash: "",
    })).toBe("https://app.ks.aileena.xyz/?ext=1");
  });
});
