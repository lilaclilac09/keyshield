#!/usr/bin/env node
/**
 * OpenClaw / agent-runtime stand-in for `scripts/record_demo.sh`.
 *
 * Listens on a Unix socket. The demo client injects a ksv2_sess_ token
 * over authenticated IPC. This process stores the token in memory
 * (process.env.KS_TOKEN) and never reads the clipboard or a .env file.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import { dirname } from "node:path";

const SOCK = process.env.KS_RECORD_IPC_SOCK;
const AUTH_HEX = process.env.KS_RECORD_IPC_AUTH || "";
const READY = process.env.KS_RECORD_IPC_READY || "";

if (!SOCK || !AUTH_HEX) {
  process.stderr.write("KS_RECORD_IPC_SOCK and KS_RECORD_IPC_AUTH are required\n");
  process.exit(1);
}

fs.mkdirSync(dirname(SOCK), { recursive: true });
try {
  fs.unlinkSync(SOCK);
} catch {
  /* first listen */
}

/** @type {{ token: string | null, spec: object | null, injectedAt: string | null }} */
const memory = { token: null, spec: null, injectedAt: null };

function authOk(mac) {
  if (typeof mac !== "string" || mac.length !== 64) return false;
  const expected = createHmac("sha256", Buffer.from(AUTH_HEX, "hex"))
    .update("ks-record-ipc-v1")
    .digest("hex");
  try {
    return timingSafeEqual(Buffer.from(mac, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

function reply(sock, body) {
  sock.write(`${JSON.stringify(body)}\n`);
}

const server = net.createServer((sock) => {
  let buf = "";
  sock.on("data", (chunk) => {
    buf += chunk.toString("utf8");
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        reply(sock, { ok: false, error: "bad json" });
        continue;
      }
      if (!authOk(msg.mac)) {
        reply(sock, { ok: false, error: "ipc auth failed" });
        continue;
      }
      if (msg.op === "inject") {
        const token = String(msg.token || "");
        if (!token.startsWith("ksv2_sess_")) {
          reply(sock, { ok: false, error: "expected ksv2_sess_ token" });
          continue;
        }
        memory.token = token;
        memory.spec = msg.spec && typeof msg.spec === "object" ? msg.spec : null;
        memory.injectedAt = new Date().toISOString();
        process.env.KS_TOKEN = token;
        process.env.KS_BASE = memory.spec?.proxy || "";
        reply(sock, {
          ok: true,
          pid: process.pid,
          token,
          hasRootSecret: Boolean(process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY),
          clipboard: "untouched",
          env: { KS_TOKEN: token, KS_BASE: process.env.KS_BASE || "" },
        });
        continue;
      }
      if (msg.op === "status") {
        reply(sock, {
          ok: true,
          pid: process.pid,
          token: memory.token,
          injectedAt: memory.injectedAt,
          specActive: Boolean(memory.spec),
          hasRootSecret: false,
        });
        continue;
      }
      reply(sock, { ok: false, error: `unknown op ${msg.op}` });
    }
  });
});

server.listen(SOCK, () => {
  try {
    fs.chmodSync(SOCK, 0o600);
  } catch {
    /* non-fatal on some FS */
  }
  if (READY) fs.writeFileSync(READY, `pid=${process.pid}\n`);
  process.stdout.write(`KS_OPENCLAW_READY unix:${SOCK} pid=${process.pid}\n`);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    try {
      fs.unlinkSync(SOCK);
    } catch {
      /* already gone */
    }
    server.close(() => process.exit(0));
  });
}
