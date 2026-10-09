import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const intent = require("../src/extension/dom-intent.js") as typeof import("../src/extension/dom-intent.js");

const PROGRAM = "41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j";

function settleWire(units: number, programId = PROGRAM) {
  const data = new Uint8Array(113);
  data[0] = 26;
  const view = new DataView(data.buffer);
  view.setBigUint64(1, BigInt(units), true);
  data[9] = 1;
  data[41] = 1;
  data[49] = 2;
  data[81] = 3;
  return { instructions: [{ programId, data }] };
}

describe("SCVD-1 DOM interception & context-aware parsing", () => {
  it("rejects null bytes and truncated UTF-8 before a session sign", () => {
    expect(() => intent.assertCleanUtf8(Uint8Array.from([0x61, 0x00, 0x62]))).toThrow(
      /null byte/,
    );
    expect(() => intent.assertCleanUtf8(Uint8Array.from([0xe2, 0x82]))).toThrow();
    expect(intent.assertCleanUtf8(new TextEncoder().encode('{"ok":true}'))).toBe(
      '{"ok":true}',
    );
  });

  it("rejects prototype pollution and non-canonical amounts in x402 bodies", () => {
    expect(() =>
      intent.parseX402Body(
        JSON.parse(
          '{"accepts":[{"__proto__":{"maxAmountRequired":"999999999"},"maxAmountRequired":"1"}]}',
        ),
      ),
    ).toThrow(/prototype pollution/);
    expect(() =>
      intent.parseX402Body({ accepts: [{ maxAmountRequired: "1e20", payTo: "A".repeat(32) }] }),
    ).toThrow(/non-canonical amount/);
    expect(() =>
      intent.parseX402Body({ accepts: [{ maxAmountRequired: "Infinity" }] }),
    ).toThrow(/non-canonical amount/);
    expect(() =>
      intent.parseX402Body({ accepts: [{ maxAmountRequired: "0x10" }] }),
    ).toThrow(/non-canonical amount/);
    expect(() => intent.parseX402Body({ accepts: { 0: { maxAmountRequired: "1" } } })).toThrow(
      /accepts/,
    );
  });

  it("refuses malformed RPC and spoofed DOM events", () => {
    expect(() => intent.parseRpcPayload("{")).toThrow(/malformed rpc/);
    expect(() => intent.parseRpcPayload("{\"method\":\"sendTransaction\\u0000\"}")).toThrow(
      /null byte/,
    );
    expect(() => intent.refuseSpoofedEvent({ type: "click" })).toThrow(/spoofed/);
    expect(intent.refuseSpoofedEvent({ type: "click", isTrusted: true })).toBe(true);
    expect(() => intent.refuseSpoofedEvent({ type: "click", isTrusted: false })).toThrow(
      /untrusted/,
    );
  });

  it("refuses empty instructions and unintended program IDs", () => {
    expect(() => intent.extractWireIntent({ instructions: [] })).toThrow(/empty instruction/);
    expect(() =>
      intent.assertIntentMatchesWire(
        { programId: PROGRAM, microUsdc: 100 },
        { instructions: [{ programId: intent.SYSTEM_PROGRAM, data: new Uint8Array(0) }] },
      ),
    ).toThrow(/empty system-program|no KeyShield/);
    const parsed = intent.parseX402Body({
      accepts: [
        {
          maxAmountRequired: "1000",
          payTo: "11111111111111111111111111111111",
          programId: PROGRAM,
          resource: "https://openrouter.ai/api",
          network: "solana-devnet",
        },
      ],
    });
    expect(parsed.microUsdc).toBe(1000);
    expect(() => intent.assertIntentMatchesWire(parsed, settleWire(999))).toThrow(
      /diverges from wire/,
    );
    expect(intent.assertIntentMatchesWire(parsed, settleWire(1000)).instructions).toHaveLength(1);
  });
});
