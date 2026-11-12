import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("agent self-register UI", () => {
  it("AuthScreen has an agent register + login path", () => {
    const src = readFileSync("src/web/components/AuthScreen.tsx", "utf8");
    expect(src).toContain('data-testid="auth-mode-agent"');
    expect(src).toContain('data-testid="agent-register"');
    expect(src).toContain('data-testid="agent-register-submit"');
    expect(src).toContain('data-testid="agent-login-submit"');
    expect(src).toContain("agentSelfRegister");
    expect(src).toContain("Generate & register");
    expect(src).toContain("No Solana wallet");
    expect(src).toContain("agent-register-next-step");
  });

  it("client posts /auth/agent-register then /auth/agent-login", () => {
    const src = readFileSync("src/web/lib/auth.ts", "utf8");
    expect(src).toContain("export async function agentSelfRegister");
    expect(src).toContain("${API_BASE}/auth/agent-register");
    expect(src).toContain("${API_BASE}/auth/agent-login");
    expect(src).toContain("pubkeyB58");
  });

  it("owner Agents section still registers via /agents/register", () => {
    const src = readFileSync("src/web/components/sections/AgentsSection.tsx", "utf8");
    expect(src).toContain("/agents/register");
    expect(src).toContain("Generate &amp; Register");
  });
});
