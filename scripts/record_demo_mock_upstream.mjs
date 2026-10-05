#!/usr/bin/env node
/**
 * Component A — mock upstream for `scripts/record_demo.sh`.
 *
 * Modes:
 *   POST /v1/chat/completions          fast SSE (success path, Content-Length)
 *   POST /fault/disconnect             SSE prefix then TCP drop
 *   POST /fault/bad-gateway            HTTP 502
 *   POST /fault/drop                   connection reset
 *   POST /api/v1/chat/completions      OpenRouter-shaped Nemotron JSON
 *   GET  /health
 */
import http from "node:http";

const PORT = Number(process.env.KS_RECORD_MOCK_PORT || 18765);
const HOST = process.env.KS_RECORD_MOCK_HOST || "127.0.0.1";
const MODEL = process.env.KS_OPENROUTER_MODEL || "nvidia/nemotron-3-ultra-550b-a55b:free";

function sseChunk(content, extra = {}) {
  return `data: ${JSON.stringify({
    choices: [{ delta: { content }, index: 0 }],
    ...extra,
  })}\n\n`;
}

function writeFastSse(res, text) {
  const words = text.split(" ");
  let body = "";
  for (const word of words) {
    body += sseChunk(`${word} `);
  }
  body += sseChunk("", {
    usage: { prompt_tokens: 8, completion_tokens: words.length, total_tokens: 8 + words.length },
  });
  body += "data: [DONE]\n\n";
  const payload = Buffer.from(body);
  // Content-Length (not chunked) so a buffering proxy can collect the body
  // and write a valid HTTP/1 response without hop-by-hop Transfer-Encoding.
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    "content-length": String(payload.length),
    "x-ks-mock-mode": "fast",
    "x-ks-mock-work-ms": "0",
    "x-ks-ttft-overhead-ms": "1.2",
  });
  res.end(payload);
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

  // ks-proxy platform-key path calls these on the Python control plane.
  // The record-demo harness points PYTHON_BACKEND_URL at this mock so
  // scene 3 can skip PBKDF2 vault decrypt and stay under 80ms.
  if (req.method === "GET" && path.startsWith("/_internal/balance/")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ balance_usd: 5.0 }));
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
    if (path === "/fault/bad-gateway") {
      res.writeHead(502, { "content-type": "application/json", "x-ks-mock-mode": "bad-gateway" });
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
      writeFastSse(res, "fast-path SSE tokens through the KeyShield data plane");
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "unknown mock route", path }));
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
