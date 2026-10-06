#!/usr/bin/env node
/**
 * Component A — mock upstream for `scripts/record_demo.sh`.
 *
 * POST /v1/chat/completions
 *   X-Test-Scenario: stream_success  10 SSE chunks, then data: [DONE]
 *   X-Test-Scenario: fault_502       truncated chunk, then HTTP 502 / socket drop
 *
 * Legacy routes kept for `npm run test:fault`:
 *   POST /fault/bad-gateway | /fault/disconnect | /fault/drop
 */
import http from "node:http";

const PORT = Number(process.env.KS_RECORD_MOCK_PORT || 18765);
const HOST = process.env.KS_RECORD_MOCK_HOST || "127.0.0.1";
const MODEL = process.env.KS_OPENROUTER_MODEL || "nvidia/nemotron-3-ultra-550b-a55b:free";
const INTERVAL_MS = Number(process.env.KS_RECORD_SSE_INTERVAL_MS || "40");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function sseChunk(content, extra = {}) {
  return `data: ${JSON.stringify({
    choices: [{ delta: { content }, index: 0 }],
    ...extra,
  })}\n\n`;
}

function scenarioOf(req) {
  const raw = req.headers["x-test-scenario"];
  const v = Array.isArray(raw) ? raw[0] : raw;
  return String(v || "").trim().toLowerCase();
}

function writeFastSse(res, text) {
  const words = text.split(" ");
  let body = "";
  for (const word of words) body += sseChunk(`${word} `);
  body += sseChunk("", {
    usage: { prompt_tokens: 8, completion_tokens: words.length, total_tokens: 8 + words.length },
  });
  body += "data: [DONE]\n\n";
  const payload = Buffer.from(body);
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    "content-length": String(payload.length),
    "x-ks-mock-mode": "fast",
  });
  res.end(payload);
}

async function writeStreamSuccess(res) {
  const tokens = [
    "Hold",
    "Verify",
    "Capture",
    "SSE",
    "through",
    "ks-proxy",
    "scoped",
    "token",
    "stream",
    "ok",
  ];
  let body = "";
  for (const tok of tokens) body += sseChunk(`${tok} `);
  body += "data: [DONE]\n\n";
  const payload = Buffer.from(body);
  const interval = Number.isFinite(INTERVAL_MS) && INTERVAL_MS >= 0 ? INTERVAL_MS : 40;
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    "content-length": String(payload.length),
    "x-ks-mock-mode": "stream_success",
    "x-ks-mock-chunks": "10",
    "x-ks-mock-interval-ms": String(interval),
    "x-ks-mock-work-ms": String(interval * 9),
  });
  // Write 10 framed SSE events with the requested pacing. Content-Length is
  // set so the buffering ks-proxy `forward()` path can emit a valid HTTP/1
  // response (chunked upstreams abort hyper with curl 52).
  let offset = 0;
  for (let i = 0; i < 10; i++) {
    const next = body.indexOf("\n\n", offset) + 2;
    res.write(payload.subarray(offset, next));
    offset = next;
    if (i < 9 && interval > 0) await sleep(interval);
  }
  res.write(payload.subarray(offset));
  res.end();
}

function writeFault502(res) {
  // Truncated SSE prefix, then 502 + socket drop (fulfillment hash cannot close).
  res.writeHead(502, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    "x-ks-mock-mode": "fault_502",
  });
  res.write(sseChunk("truncated-eof "));
  res.destroy();
}

function writeNemotronJson(res) {
  const body = JSON.stringify({
    id: "gen-ks-record-demo-nemotron",
    object: "chat.completion",
    model: MODEL,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content:
            "KeyShield vault online. Nemotron-3-Ultra plug-in ready — secret stayed in the vault.",
        },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 8, completion_tokens: 16, total_tokens: 24 },
    ks_demo: true,
  });
  const payload = Buffer.from(body);
  res.writeHead(200, {
    "content-type": "application/json",
    "content-length": String(payload.length),
    "x-ks-mock-mode": "nemotron",
  });
  res.end(payload);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
  const path = url.pathname;

  if (req.method === "GET" && path === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok", component: "A", mock: true }));
    return;
  }

  if (req.method === "GET" && path.startsWith("/_internal/balance/")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ balance_usd: 5.0, mock: true }));
    return;
  }
  if (req.method === "POST" && path === "/_internal/log") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ingested: 0 }));
    return;
  }

  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    void (async () => {
      if (path === "/fault/bad-gateway") {
        res.writeHead(502, {
          "content-type": "application/json",
          "x-ks-mock-mode": "bad-gateway",
        });
        res.end(JSON.stringify({ error: { message: "scvd.store bad gateway", type: "upstream_error" } }));
        return;
      }
      if (path === "/fault/drop") {
        res.destroy();
        return;
      }
      if (path === "/fault/disconnect") {
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "close",
          "x-ks-mock-mode": "disconnect",
        });
        res.write(sseChunk("partial "));
        res.write(sseChunk("stream "));
        res.write('data: {"choices":[{"delta":{"content":"cut"}}],"usage":{"total_tokens":1000}}\n\n');
        setTimeout(() => res.destroy(), 20);
        return;
      }
      if (path === "/api/v1/chat/completions") {
        writeNemotronJson(res);
        return;
      }
      if (path === "/v1/chat/completions" || path === "/fast" || path.endsWith("/chat/completions")) {
        const scenario = scenarioOf(req);
        if (scenario === "fault_502") {
          writeFault502(res);
          return;
        }
        if (scenario === "stream_success") {
          await writeStreamSuccess(res);
          return;
        }
        writeFastSse(res, "fast-path SSE tokens through the KeyShield data plane");
        return;
      }
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unknown mock route", path }));
    })().catch(() => {
      try {
        res.destroy();
      } catch {
        /* ignore */
      }
    });
  });
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`KS_MOCK_READY http://${HOST}:${PORT}\n`);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
  });
}
