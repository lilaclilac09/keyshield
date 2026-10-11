import { describe, expect, it } from "vitest";
import {
  DETECT_DEMO_KEY,
  localDashboardSigninHref,
  resolveSigninHref,
  shouldAutoStore,
} from "../src/web/lib/ext-autostore";

describe("shouldAutoStore", () => {
  it("saves after permission when there are unsaved keys", () => {
    expect(shouldAutoStore({
      permissionGranted: true,
      unsavedCount: 1,
      alreadySaving: false,
    })).toBe(true);
  });

  it("does not save before permission", () => {
    expect(shouldAutoStore({
      permissionGranted: false,
      unsavedCount: 2,
      alreadySaving: false,
    })).toBe(false);
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
  it("keeps local Vite when Use local dev is pinned", () => {
    expect(resolveSigninHref({ pinnedLocal: true })).toBe(
      "http://127.0.0.1:5173/?local=1&ext=1",
    );
  });

  it("opens hosted Sign-in when local is not pinned", () => {
    expect(resolveSigninHref({ pinnedLocal: false })).toBe(
      "https://app.ks.aileena.xyz/?ext=1",
    );
  });

  it("marks local Sign-in so the 5173 bounce does not fire", () => {
    expect(localDashboardSigninHref()).toContain("local=1");
    expect(DETECT_DEMO_KEY.startsWith("sk-proj-")).toBe(true);
    expect(DETECT_DEMO_KEY.length).toBeGreaterThan(30);
    expect(/sk-proj-[A-Za-z0-9_-]{20,}/.test(DETECT_DEMO_KEY)).toBe(true);
  });
});
