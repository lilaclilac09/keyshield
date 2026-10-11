import { describe, expect, it } from "vitest";
import {
  DETECT_DEMO_KEY,
  hostedSigninHref,
  localDashboardSigninHref,
  resolveReachableSigninHref,
  resolveSigninHref,
  shouldAutoStore,
  shouldUseLocalDashboard,
} from "../src/web/lib/ext-autostore";

describe("shouldAutoStore", () => {
  it("saves after permission when there are unsaved keys", () => {
    expect(shouldAutoStore({
      permissionGranted: true,
      unsavedCount: 1,
      alreadySaving: false,
    })).toBe(true);
  });

  it("does not save before permission or login", () => {
    expect(shouldAutoStore({
      permissionGranted: false,
      unsavedCount: 2,
      alreadySaving: false,
    })).toBe(false);
  });

  it("saves after Sign-in even without the Allow click", () => {
    expect(shouldAutoStore({
      permissionGranted: false,
      loggedIn: true,
      unsavedCount: 1,
      alreadySaving: false,
    })).toBe(true);
  });

  it("does not double-fire while a save is in flight", () => {
    expect(shouldAutoStore({
      permissionGranted: true,
      unsavedCount: 1,
      alreadySaving: true,
    })).toBe(false);
  });
});

describe("resolveSigninHref", () => {
  it("keeps local Vite only when Use local is pinned AND 5173 is live", () => {
    expect(resolveSigninHref({ pinnedLocal: true, localLive: true })).toBe(
      "http://127.0.0.1:5173/?local=1&ext=1&demo=shop",
    );
  });

  it("opens hosted Sign-in when local is not pinned", () => {
    expect(resolveSigninHref({ pinnedLocal: false })).toBe(
      "https://app.ks.aileena.xyz/?ext=1&demo=shop",
    );
  });

  it("opens hosted Sign-in when 5173 is pinned but refused", () => {
    expect(resolveSigninHref({ pinnedLocal: true, localLive: false })).toBe(
      "https://app.ks.aileena.xyz/?ext=1&demo=shop",
    );
    expect(shouldUseLocalDashboard({ pinnedLocal: true, localLive: false })).toBe(false);
  });

  it("marks local Sign-in so the 5173 bounce does not fire", () => {
    expect(localDashboardSigninHref()).toContain("local=1");
    expect(hostedSigninHref()).toContain("demo=shop");
    expect(DETECT_DEMO_KEY.startsWith("sk-proj-")).toBe(true);
    expect(DETECT_DEMO_KEY.length).toBeGreaterThan(30);
    expect(/sk-proj-[A-Za-z0-9_-]{20,}/.test(DETECT_DEMO_KEY)).toBe(true);
  });

  it("falls back when the probe says 5173 is dead", async () => {
    const out = await resolveReachableSigninHref({
      pinnedLocal: true,
      probe: async () => false,
    });
    expect(out.usedLocal).toBe(false);
    expect(out.href).toBe("https://app.ks.aileena.xyz/?ext=1&demo=shop");
  });

  it("uses local when the probe says Vite is up", async () => {
    const out = await resolveReachableSigninHref({
      pinnedLocal: true,
      probe: async () => true,
    });
    expect(out.usedLocal).toBe(true);
    expect(out.href).toContain("127.0.0.1:5173");
    expect(out.href).toContain("local=1");
  });
});
