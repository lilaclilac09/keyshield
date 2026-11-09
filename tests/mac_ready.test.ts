import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");
const script = resolve(root, "scripts/mac_ready.py");
const installLocal = readFileSync(resolve(root, "src/extension/INSTALL-LOCAL.md"), "utf8");
const readme = readFileSync(resolve(root, "README.md"), "utf8");
const macReady = readFileSync(script, "utf8");

function runReady(cwd: string, extraEnv: NodeJS.ProcessEnv = {}) {
  return execFileSync(process.env.PYTHON || "python3", [script], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, KS_ROOT: root, ...extraEnv },
  });
}

describe("mac_ready.py — any cwd", () => {
  it("prints name / version / path / READY from $HOME and /tmp", () => {
    for (const cwd of [homedir(), tmpdir(), "/"]) {
      const out = runReady(cwd);
      const lines = out.trimEnd().split("\n");
      expect(lines[0]).toBe("KeyShield — Sovereign Vault");
      expect(lines[1]).toBe("1.2.5");
      expect(lines[2]).toBe(resolve(root, "src/extension"));
      expect(lines[3]).toBe("popup.html");
      expect(lines[4]).toBe("<all_urls>");
      expect(lines[5]).toBe("READY 1.2.5");
      expect(out).toContain("ok 1.2.5 <all_urls>");
      expect(out).toContain("1.2.5 · latest");
      expect(out).toContain("Remove every KeyShield card");
      expect(out).toContain("LOAD UNPACKED ONLY");
      expect(out).toContain("toolbar then:");
      expect(out).toContain("do not run patch-leftover-bridge.py");
    }
  });

  it("INSTALL-LOCAL heredoc is zsh-safe and uses the Mac clone path", () => {
    expect(installLocal).toContain("/Users/aileen/Downloads/privacy_hack/keyshield");
    expect(installLocal).toContain("python3 - <<'PY'");
    expect(installLocal).toContain("print(m['name'])");
    expect(installLocal).toContain("print(m['version'])");
    expect(installLocal).toContain("READY 1.2.5");
    expect(installLocal).toContain("LOAD UNPACKED ONLY");
    expect(installLocal).toContain("patch-leftover-bridge.py");
    expect(installLocal).toContain("toolbar then:");
    expect(installLocal).not.toContain("eval $(");
    expect(installLocal).not.toContain("python3 -c");
    expect(macReady).toContain("MAC_ROOT");
    expect(macReady).toContain("/Users/aileen/Downloads/privacy_hack/keyshield");
    expect(macReady).not.toContain("cd to ~/Downloads/privacy_hack/keyshield first");
    expect(macReady).not.toContain("eval $(");
    expect(readme).toContain("### Chrome extension Sign in");
    expect(readme).not.toContain("Popup Settings → Dashboard URL");
    expect(readme).not.toContain("ks.app.aileena.xyz");
    expect(readme).not.toContain("Keep UI with `?local=1`");
  });

  it("INSTALL-LOCAL heredoc prints READY from /tmp when KS_ROOT is set", () => {
    const start = installLocal.indexOf("python3 - <<'PY'");
    const bodyStart = installLocal.indexOf("\n", start) + 1;
    const bodyEnd = installLocal.indexOf("\nPY\n", bodyStart);
    const body = installLocal.slice(bodyStart, bodyEnd);
    const out = execFileSync(process.env.PYTHON || "python3", ["-"], {
      cwd: tmpdir(),
      encoding: "utf8",
      input: body,
      env: { ...process.env, KS_ROOT: root },
    });
    const lines = out.trimEnd().split("\n");
    expect(lines[0]).toBe("KeyShield — Sovereign Vault");
    expect(lines[1]).toBe("1.2.5");
    expect(lines[2]).toBe(resolve(root, "src/extension"));
    expect(lines[5]).toBe("READY 1.2.5");
  });

  it("exits 1 with NO CLONE when stdin-run and no clone is visible", () => {
    let err: { status?: number; stderr?: string } | undefined;
    try {
      execFileSync(process.env.PYTHON || "python3", ["-"], {
        cwd: tmpdir(),
        encoding: "utf8",
        input: readFileSync(script),
        env: {
          PATH: process.env.PATH,
          KS_ROOT: "/tmp/keyshield-missing-clone",
          HOME: tmpdir(),
        },
      });
    } catch (caught) {
      err = caught as { status?: number; stderr?: string };
    }
    expect(err?.status).toBe(1);
    expect(String(err?.stderr || "")).toContain("NO CLONE");
  });

  it("restores leftover 1.2.4 stamp on product src/extension only", () => {
    const tmp = join(tmpdir(), `ks-restore-125-${Date.now()}`);
    const ext = join(tmp, "src/extension");
    mkdirSync(ext, { recursive: true });
    mkdirSync(join(tmp, "src/web"), { recursive: true });
    writeFileSync(
      join(ext, "manifest.json"),
      JSON.stringify({
        name: "KeyShield — Sovereign Vault",
        version: "1.2.4",
        host_permissions: ["<all_urls>"],
        action: {},
      }),
    );
    writeFileSync(join(ext, "popup.html"), '<div id="detect-ready">ok 1.2.4 &lt;all_urls&gt;</div>');
    writeFileSync(join(ext, "popup.js"), 'if (ver === "1.2.4") ok = true;');
    const leftoverOnly = join(tmpdir(), `ks-leftover-only-${Date.now()}`);
    mkdirSync(leftoverOnly, { recursive: true });
    writeFileSync(
      join(leftoverOnly, "manifest.json"),
      JSON.stringify({ name: "KeyShield — Sovereign Vault", version: "1.2.4", action: {} }),
    );
    const out = execFileSync(process.env.PYTHON || "python3", [script], {
      cwd: tmpdir(),
      encoding: "utf8",
      env: { ...process.env, KS_ROOT: tmp },
    });
    const man = JSON.parse(readFileSync(join(ext, "manifest.json"), "utf8"));
    expect(man.version).toBe("1.2.5");
    expect(man.action.default_popup).toBe("popup.html");
    expect(out).toContain("READY 1.2.5");
    expect(out).toContain("restored 1.2.4 -> 1.2.5");
    expect(out).toContain("LOAD UNPACKED ONLY");
    expect(JSON.parse(readFileSync(join(leftoverOnly, "manifest.json"), "utf8")).version).toBe(
      "1.2.4",
    );
  });
});
