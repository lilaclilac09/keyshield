#!/usr/bin/env node
/**
 * Component A — mock upstream for `scripts/record_demo.sh`.
 *
 * Modes:
 *   POST /v1/chat/completions          fast SSE (success path)
 *   POST /fault/disconnect             SSE prefix then TCP drop
 *   POST /fault/bad-gateway            HTTP 502
 *   POST /fault/drop                   connection reset
 *   POST /api/v1/chat/completions      OpenRouter-shaped Nemotron mock
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
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
    "x-ks-mock-mode": "fast",
    "x-ks-mock-work-ms": "0",
  });
  const words = text.split(" ");
  for (const word of words) {
    res.write(sseChunk(`${word} `));
  }
  res.write(
    sseChunk("", {
      usage: { prompt_tokens: 8, completion_tokens: words.length, total_tokens: 8 + words.length },
    }),
  );
  res.write("data: [DONE]\n\n");
  res.end();
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
  const path = url.pathname;

  if (req.method === "GET" && path === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok", component: "A", mock: true }));
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
    if (path === "/api/v1/chat/completions" || path.endsWith("/chat/completions")) {
      writeFastSse(res, `KeyShield Nemotron mock via ${MODEL} — vault key never printed`);
      return;
    }
    if (path === "/v1/chat/completions" || path === "/fast") {
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
