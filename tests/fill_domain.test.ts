import { describe, expect, it } from "vitest";
import {
  matchInputToUpstream,
  pickKeyForInput,
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
  });
});
