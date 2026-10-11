import { describe, expect, it } from "vitest";
import {
  assignKeysToInputs,
  isCursorFillHost,
  isCursorKeyFetchContext,
  isCursorSettingsPath,
  looksLikeCursorApiBlank,
  matchInputToUpstream,
  pickKeyForInput,
  preferredCursorFillKey,
  shouldAutoFillInput,
  upstreamsForHostname,
} from "../src/web/lib/fill-domain";

describe("upstreamsForHostname", () => {
  it("maps cursor.com Settings to Cursor plus model-provider keys", () => {
    expect(upstreamsForHostname("www.cursor.com")).toEqual([
      "cursor",
      "openai",
      "anthropic",
      "openrouter",
      "groq",
    ]);
    expect(upstreamsForHostname("cursor.sh")).toContain("openai");
  });

  it("keeps openai.com on openai only", () => {
    expect(upstreamsForHostname("platform.openai.com")).toEqual(["openai"]);
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

  it("falls through to the leftover key when the labeled upstream was already used", () => {
    const leftover = pickKeyForInput("OpenAI API Key", [
      { upstream: "openrouter", value: "sk-or-v1-LOCALONLY" },
    ], { hostname: "cursor.com", inputType: "password" });
    expect(leftover?.upstream).toBe("openrouter");
  });
});
