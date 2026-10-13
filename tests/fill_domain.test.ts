import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assignKeysToInputs,
  hintsWantNvidia,
  isCursorFillHost,
  isCursorKeyFetchContext,
  isCursorSettingsPath,
  isFillablePageUrl,
  isKiloFillHost,
  isKiloKeyFetchContext,
  isLocalFillDemoPath,
  isNvidiaFillHost,
  isNvidiaKeyFetchContext,
  looksLikeCursorApiBlank,
  looksLikeKiloApiBlank,
  matchInputToUpstream,
  pickKeyForInput,
  preferredCursorFillKey,
  preferredKiloFillKey,
  shouldAutoFillInput,
  unlockUpstreamsForFill,
  upstreamsForHostname,
  vaultItemMatchesWanted,
} from "../src/web/lib/fill-domain";

describe("upstreamsForHostname", () => {
  it("maps cursor.com Settings to Cursor plus model-provider keys", () => {
    expect(upstreamsForHostname("www.cursor.com")).toEqual([
      "cursor",
      "openai",
      "anthropic",
      "openrouter",
      "nvidia",
      "groq",
    ]);
    expect(upstreamsForHostname("cursor.sh")).toContain("openai");
  });

  it("keeps openai.com on openai only", () => {
    expect(upstreamsForHostname("platform.openai.com")).toEqual(["openai"]);
  });

  it("maps Kilo BYOK hosts to a saved OpenRouter key", () => {
    expect(upstreamsForHostname("app.kilo.ai")).toEqual(["openrouter"]);
    expect(upstreamsForHostname("kilo.ai")).toEqual(["openrouter"]);
    expect(upstreamsForHostname("www.kilo.ai")).toEqual(["openrouter"]);
    expect(upstreamsForHostname("kilo.demo.localhost")).toEqual(["openrouter"]);
  });

  it("maps NVIDIA NIM hosts to nvidia plus OpenRouter fallback", () => {
    expect(isNvidiaFillHost("build.nvidia.com")).toBe(true);
    expect(upstreamsForHostname("build.nvidia.com")).toEqual(["nvidia", "openrouter"]);
    expect(upstreamsForHostname("integrate.api.nvidia.com")).toContain("nvidia");
    expect(isNvidiaKeyFetchContext({
      hostname: "127.0.0.1",
      pathname: "/nvidia-fill-demo.html",
    })).toBe(true);
  });
});

describe("pickKeyForInput", () => {
  const keys = [
    { upstream: "openai", value: "sk-proj-LOCALONLY" },
    { upstream: "anthropic", value: "sk-ant-api03-LOCALONLY" },
    { upstream: "openrouter", value: "sk-or-v1-LOCALONLY" },
  ];

  it("fills the Cursor OpenAI API blank with the openai row", () => {
    const picked = pickKeyForInput("OpenAI API Key", keys);
    expect(picked?.upstream).toBe("openai");
    expect(shouldAutoFillInput("")).toBe(true);
    expect(shouldAutoFillInput("already-typed")).toBe(false);
  });

  it("fills the Anthropic blank, not the openai row", () => {
    expect(pickKeyForInput("Anthropic API Key", keys)?.upstream).toBe("anthropic");
  });

  it("does not guess when several keys exist and the blank is unlabeled", () => {
    expect(matchInputToUpstream("password")).toBeNull();
    expect(pickKeyForInput("password", keys)).toBeNull();
  });

  it("does not paste an API key into a login password box", () => {
    expect(pickKeyForInput("Password", [{ upstream: "openai", value: "sk-proj-LOCALONLY" }])).toBeNull();
    expect(pickKeyForInput("Password", keys, { hostname: "cursor.com" })).toBeNull();
  });

  it("does not paste into Cursor dashboard Key Name", () => {
    expect(pickKeyForInput("Enter User API Key Name...", keys, {
      hostname: "cursor.com",
      pathname: "/dashboard/api",
    })).toBeNull();
  });

  it("pastes the OpenAI row into Cursor Settings black space", () => {
    expect(isCursorFillHost("www.cursor.com")).toBe(true);
    expect(isCursorSettingsPath("/settings", "Cursor Settings")).toBe(true);
    expect(preferredCursorFillKey(keys)?.upstream).toBe("openai");
    expect(pickKeyForInput("", keys, { hostname: "cursor.com", inputType: "password" })?.value)
      .toBe("sk-proj-LOCALONLY");
    expect(pickKeyForInput("API Keys", keys, { hostname: "www.cursor.com" })?.upstream).toBe("openai");
    expect(looksLikeCursorApiBlank({
      haystack: "",
      hostname: "cursor.com",
      pathname: "/settings",
      title: "Cursor Settings",
      inputType: "password",
    })).toBe(true);
  });

  it("does not unlock vault keys for a page that only spoofs the Cursor title", () => {
    expect(isCursorKeyFetchContext({ hostname: "evil.example", pathname: "/" })).toBe(false);
    expect(isCursorKeyFetchContext({
      hostname: "127.0.0.1",
      pathname: "/cursor-settings-fill-demo.html",
    })).toBe(true);
  });

  it("treats local journey / story fixtures as Cursor fill demos", () => {
    expect(isLocalFillDemoPath("/journey/cursor.html")).toBe(true);
    expect(isLocalFillDemoPath("/story")).toBe(true);
    expect(isCursorKeyFetchContext({
      hostname: "127.0.0.1",
      pathname: "/journey/cursor.html",
    })).toBe(true);
    expect(isFillablePageUrl("http://127.0.0.1:5173/cursor-settings-fill-demo.html")).toBe(true);
    expect(isFillablePageUrl("chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef/cursor-settings-fill-demo.html")).toBe(true);
    expect(isFillablePageUrl("http://127.0.0.1:5173/kilo-byok-fill-demo.html")).toBe(true);
    expect(isFillablePageUrl("chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef/kilo-byok-fill-demo.html")).toBe(true);
    expect(isFillablePageUrl("chrome://extensions")).toBe(false);
  });

  it("auto-fills an API Key blank when several stored keys exist", () => {
    expect(pickKeyForInput("API Key", keys)?.value).toBe("sk-proj-LOCALONLY");
    expect(pickKeyForInput("API Key", keys, {
      hostname: "127.0.0.1",
      pathname: "/journey/cursor.html",
    })?.upstream).toBe("openai");
  });

  it("assigns leftover keys to extra unlabeled Cursor black spaces", () => {
    const assigned = assignKeysToInputs(
      [
        { haystack: "OpenAI API Key", inputType: "password" },
        { haystack: "Anthropic API Key", inputType: "password" },
        { haystack: "", inputType: "password" },
        { haystack: "Password", inputType: "password" },
      ],
      keys,
      { hostname: "cursor.com", pathname: "/settings", title: "Cursor Settings" },
    );
    expect(assigned[0]?.value).toBe("sk-proj-LOCALONLY");
    expect(assigned[1]?.value).toBe("sk-ant-api03-LOCALONLY");
    expect(assigned[2]?.value).toBe("sk-or-v1-LOCALONLY");
    expect(assigned[3]).toBeNull();
  });

  it("pastes the saved OpenRouter key into Kilo BYOK API Key blanks", () => {
    expect(isKiloFillHost("app.kilo.ai")).toBe(true);
    expect(isKiloKeyFetchContext({ hostname: "app.kilo.ai", pathname: "/byok" })).toBe(true);
    expect(isKiloKeyFetchContext({ hostname: "evil.example", pathname: "/byok" })).toBe(false);
    expect(isKiloKeyFetchContext({
      hostname: "127.0.0.1",
      pathname: "/kilo-byok-fill-demo.html",
    })).toBe(true);
    expect(preferredKiloFillKey(keys)?.upstream).toBe("openrouter");
    expect(pickKeyForInput("API Key", keys, {
      hostname: "app.kilo.ai",
      pathname: "/byok",
      inputType: "password",
    })?.value).toBe("sk-or-v1-LOCALONLY");
    expect(pickKeyForInput("OpenRouter API Key", keys)?.upstream).toBe("openrouter");
    expect(looksLikeKiloApiBlank({
      haystack: "API Key",
      hostname: "app.kilo.ai",
      pathname: "/byok",
      inputType: "password",
    })).toBe(true);
    expect(pickKeyForInput("Password", keys, {
      hostname: "app.kilo.ai",
      pathname: "/byok",
    })).toBeNull();
    const assigned = assignKeysToInputs(
      [
        { haystack: "OpenRouter API Key", inputType: "password" },
        { haystack: "Password", inputType: "password" },
      ],
      keys,
      { hostname: "app.kilo.ai", pathname: "/byok", title: "Bring Your Own Key (BYOK)" },
    );
    expect(assigned[0]?.value).toBe("sk-or-v1-LOCALONLY");
    expect(assigned[1]).toBeNull();
  });

  it("pastes a vault NVIDIA key into an NVIDIA / unlabeled agent API blank", () => {
    const nvidia = { upstream: "nvidia", name: "NVIDIA NIM", value: "nvapi-LOCALONLYFILLTEST1234" };
    const mixed = [
      { upstream: "openrouter", value: "sk-or-v1-LOCALONLY" },
      nvidia,
    ];
    expect(matchInputToUpstream("NVIDIA API Key")).toBe("nvidia");
    expect(hintsWantNvidia(["NVIDIA API Key"])).toBe(true);
    expect(pickKeyForInput("NVIDIA API Key", mixed)?.value).toBe("nvapi-LOCALONLYFILLTEST1234");
    expect(pickKeyForInput("API Key", [nvidia], {
      hostname: "build.nvidia.com",
      inputType: "password",
    })?.upstream).toBe("nvidia");
    expect(pickKeyForInput("API Key", [nvidia], {
      hostname: "127.0.0.1",
      pathname: "/nvidia-fill-demo.html",
    })?.value).toBe("nvapi-LOCALONLYFILLTEST1234");
    expect(unlockUpstreamsForFill({ hostname: "build.nvidia.com" })).toEqual(["nvidia", "openrouter"]);
    expect(unlockUpstreamsForFill({
      hostname: "agent.example",
      hints: ["NVIDIA API Key"],
      hasKeyBlanks: true,
    })).toEqual(["nvidia", "openrouter"]);
    expect(unlockUpstreamsForFill({ hostname: "evil.example", pathname: "/" })).toEqual([]);
    expect(vaultItemMatchesWanted({ upstream: "custom", name: "NVIDIA API key" }, ["nvidia"])).toBe(true);
    expect(vaultItemMatchesWanted({ upstream: "openai", name: "openai key" }, ["nvidia"])).toBe(false);
    expect(isLocalFillDemoPath("/nvidia-fill-demo.html")).toBe(true);
    expect(isFillablePageUrl("http://127.0.0.1:5173/nvidia-fill-demo.html")).toBe(true);
  });

  it("falls through to the leftover key when the labeled upstream was already used", () => {
    const leftover = pickKeyForInput("OpenAI API Key", [
      { upstream: "openrouter", value: "sk-or-v1-LOCALONLY" },
    ], { hostname: "cursor.com", inputType: "password" });
    expect(leftover?.upstream).toBe("openrouter");
  });
});

describe("extension fill uses queued vault keys", () => {
  it("background returns pending keys so Cursor blanks get pasted", () => {
    const bg = readFileSync(resolve(__dirname, "../src/extension/background.js"), "utf8");
    const content = readFileSync(resolve(__dirname, "../src/extension/content.js"), "utf8");
    expect(bg).toContain("function pendingKeysForUpstreams");
    expect(bg).toContain("function getKeysForDomain");
    expect(bg).toContain("function fillCursorTabsFromPending");
    expect(bg).toContain("function injectedAutoFill");
    expect(content).toContain("function ksAutoFillEmptyInputs");
    expect(content).toContain("function ksLooksLikeCursorApiBlank");
    expect(content).toContain("function ksLooksLikeKeyNameField");
    expect(content).toContain("function ksFillPageNow");
    expect(content).toContain("function ksIsLocalFillDemo");
    expect(bg).toContain("function _isFillableTabUrl");
    expect(bg).toContain("fillCursorTabsFromPending");
    expect(bg).toContain("/journey/cursor");
    expect(bg).toContain("GET_KEYS_FOR_DOMAIN");
    const popup = readFileSync(resolve(__dirname, "../src/extension/popup.js"), "utf8");
    expect(popup).toContain("return fillActiveTab()");
    expect(popup).not.toContain("paste into the Cursor API black box");
    const leftover = readFileSync(resolve(__dirname, "../src/extension/patch-leftover-bridge.py"), "utf8");
    expect(leftover).toContain("async function copyPreferredCursorKey(){return refreshFillStatus();}");
    const demo = readFileSync(resolve(__dirname, "../src/web/public/cursor-settings-fill-demo.html"), "utf8");
    expect(demo).toContain("OpenAI API Key");
    expect(demo).toContain("127.0.0.1:5173/cursor-settings-fill-demo.html");
    expect(content).toContain("isKeyShieldDashboardHost() && !ksIsLocalFillDemo() && !ksIsKiloFillContext()");
    expect(content).toContain("(ksIsKiloFillContext() || ksIsCursorFillContext() || ksIsNvidiaFillContext()) ? remaining[0]");
    expect(content).toContain("function ksIsNvidiaFillContext");
    expect(content).toContain("nvapi-");
    expect(bg).toContain("NVIDIA_FILL_UPSTREAMS");
    expect(bg).toContain("_hintsWantNvidia");
    expect(bg).toContain("if (!message.silent) notify");
    expect(popup).toContain('ver === "1.2.5"');
    const nvidiaDemo = readFileSync(resolve(__dirname, "../src/web/public/nvidia-fill-demo.html"), "utf8");
    expect(nvidiaDemo).toContain("NVIDIA API Key");
    expect(nvidiaDemo).toContain("127.0.0.1:5173/nvidia-fill-demo.html");
    expect(nvidiaDemo).toContain("data-testid=\"nvidia-api-key\"");
    expect(bg).toContain("'app.kilo.ai'");
    expect(bg).toContain("function _isKiloKeyFetchContext");
    expect(content).toContain("function ksIsKiloFillContext");
    expect(content).toContain("function ksPreferredKiloFillKey");
    const kiloDemo = readFileSync(resolve(__dirname, "../src/web/public/kilo-byok-fill-demo.html"), "utf8");
    expect(kiloDemo).toContain("OpenRouter API Key");
    expect(kiloDemo).toContain("127.0.0.1:5173/kilo-byok-fill-demo.html");
    expect(kiloDemo).toContain("data-testid=\"kilo-openrouter-key\"");
  });
});
