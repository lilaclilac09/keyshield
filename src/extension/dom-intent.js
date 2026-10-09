/**
 * Context-aware DOM / x402 / RPC intent parser.
 *
 * Session keys must sign the serialized wire transaction, not the
 * DApp-rendered prompt. This module is the gate: it rejects mutated
 * UTF-8, prototype pollution, spoofed payment events, empty
 * instruction lists, and any DOM amount / program ID that does not
 * match the compiled instruction bytes.
 *
 * Loaded before content.js in the extension manifest so the fetch
 * interceptor can call `KeyShieldDomIntent`.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.KeyShieldDomIntent = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const KEYSHIELD_PROGRAM_IDS = Object.freeze([
    "41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j",
  ]);
  const SYSTEM_PROGRAM = "11111111111111111111111111111111";
  const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
  const MICRO_AMOUNT = /^(0|[1-9][0-9]{0,17})$/;
  const BASE58_32 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

  function wipeBytes(buf) {
    if (buf && typeof buf.fill === "function") buf.fill(0);
  }

  function hasNullByte(value) {
    if (typeof value === "string") return value.indexOf("\0") !== -1;
    if (value instanceof Uint8Array) return value.includes(0);
    return false;
  }

  function assertCleanUtf8(bytes) {
    if (!(bytes instanceof Uint8Array)) {
      throw new Error("dom-intent: expected bytes");
    }
    if (bytes.includes(0)) {
      throw new Error("dom-intent: null byte in payload");
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (hasNullByte(text)) {
      throw new Error("dom-intent: null byte in decoded utf-8");
    }
    return text;
  }

  function ownData(value) {
    if (value === null || typeof value !== "object") {
      throw new Error("dom-intent: expected object");
    }
    if (Array.isArray(value)) {
      throw new Error("dom-intent: unexpected array at object root");
    }
    const out = Object.create(null);
    for (const key of Object.keys(value)) {
      if (FORBIDDEN_KEYS.has(key)) {
        throw new Error("dom-intent: prototype pollution key");
      }
      out[key] = value[key];
    }
    return out;
  }

  function parseMicroAmount(raw) {
    if (typeof raw === "number") {
      if (!Number.isInteger(raw) || raw < 0 || !Number.isSafeInteger(raw)) {
        throw new Error("dom-intent: non-canonical amount");
      }
      return raw;
    }
    if (typeof raw !== "string" || !MICRO_AMOUNT.test(raw)) {
      throw new Error("dom-intent: non-canonical amount");
    }
    return Number(raw);
  }

  function sanitizeText(value, label) {
    if (value == null) return "";
    if (typeof value !== "string") {
      throw new Error(`dom-intent: ${label} must be a string`);
    }
    if (hasNullByte(value)) {
      throw new Error(`dom-intent: null byte in ${label}`);
    }
    if (/\uFFFD/.test(value)) {
      throw new Error(`dom-intent: replacement char in ${label}`);
    }
    return value;
  }

  function parseX402Body(body) {
    const root = ownData(body);
    if (!Array.isArray(root.accepts) || root.accepts.length === 0) {
      throw new Error("dom-intent: accepts[] required");
    }
    const first = ownData(root.accepts[0]);
    const micro = parseMicroAmount(first.maxAmountRequired ?? first.amount);
    const payTo = sanitizeText(first.payTo ?? "", "payTo");
    const network = sanitizeText(first.network ?? "", "network");
    const resource = sanitizeText(first.resource ?? "", "resource");
    const programId = sanitizeText(first.programId ?? KEYSHIELD_PROGRAM_IDS[0], "programId");
    if (payTo && !BASE58_32.test(payTo)) {
      throw new Error("dom-intent: payTo is not a pubkey");
    }
    if (!KEYSHIELD_PROGRAM_IDS.includes(programId)) {
      throw new Error("dom-intent: unintended program id");
    }
    return {
      microUsdc: micro,
      amountUsd: micro / 1_000_000,
      payTo,
      network,
      resource,
      programId,
    };
  }

  function parseRpcPayload(raw) {
    let text;
    if (raw instanceof Uint8Array) {
      text = assertCleanUtf8(raw);
    } else if (typeof raw === "string") {
      if (hasNullByte(raw)) throw new Error("dom-intent: null byte in rpc");
      text = raw;
    } else if (raw && typeof raw === "object") {
      return canonicalizeRpc(ownData(raw));
    } else {
      throw new Error("dom-intent: empty rpc payload");
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("dom-intent: malformed rpc json");
    }
    return canonicalizeRpc(ownData(parsed));
  }

  function canonicalizeRpc(rpc) {
    const method = sanitizeText(rpc.method ?? "", "method");
    if (!method) throw new Error("dom-intent: rpc method required");
    const params = Array.isArray(rpc.params) ? rpc.params : [];
    return { method, params };
  }

  function extractWireIntent(tx) {
    if (!tx || typeof tx !== "object") {
      throw new Error("dom-intent: missing wire tx");
    }
    const instructions = Array.isArray(tx.instructions) ? tx.instructions : [];
    if (instructions.length === 0) {
      throw new Error("dom-intent: empty instruction list");
    }
    const compiled = [];
    for (const ix of instructions) {
      const programId = sanitizeText(ix.programId ?? "", "programId");
      if (!programId) throw new Error("dom-intent: empty program id");
      if (programId === SYSTEM_PROGRAM && ix.data && ix.data.length === 0) {
        throw new Error("dom-intent: empty system-program instruction");
      }
      const data =
        ix.data instanceof Uint8Array
          ? ix.data
          : Array.isArray(ix.data)
            ? Uint8Array.from(ix.data)
            : new Uint8Array(0);
      compiled.push({ programId, data, dataLength: data.length });
    }
    return { instructions: compiled };
  }

  function assertIntentMatchesWire(domIntent, wireTx) {
    const wire = extractWireIntent(wireTx);
    const payment = wire.instructions.find((ix) =>
      KEYSHIELD_PROGRAM_IDS.includes(ix.programId),
    );
    if (!payment) {
      throw new Error("dom-intent: wire tx has no KeyShield program id");
    }
    if (domIntent.programId !== payment.programId) {
      throw new Error("dom-intent: DOM program id diverges from wire");
    }
    if (payment.dataLength === 0) {
      throw new Error("dom-intent: empty instruction data");
    }
    if (payment.data[0] !== 24 && payment.data[0] !== 25 && payment.data[0] !== 26) {
      throw new Error("dom-intent: unexpected payment discriminator");
    }
    if (typeof domIntent.microUsdc === "number" && payment.data[0] === 26 && payment.dataLength >= 9) {
      const view = new DataView(payment.data.buffer, payment.data.byteOffset, payment.data.byteLength);
      const units = Number(view.getBigUint64(1, true));
      if (units !== domIntent.microUsdc) {
        throw new Error("dom-intent: DOM amount diverges from wire units");
      }
    }
    return wire;
  }

  function refuseSpoofedEvent(eventLike) {
    if (!eventLike || typeof eventLike !== "object") {
      throw new Error("dom-intent: missing event");
    }
    if (eventLike.isTrusted !== true) {
      throw new Error(
        eventLike.isTrusted === false
          ? "dom-intent: untrusted DOM event"
          : "dom-intent: spoofed DOM event",
      );
    }
    return true;
  }

  return {
    KEYSHIELD_PROGRAM_IDS,
    SYSTEM_PROGRAM,
    wipeBytes,
    hasNullByte,
    assertCleanUtf8,
    parseX402Body,
    parseRpcPayload,
    extractWireIntent,
    assertIntentMatchesWire,
    refuseSpoofedEvent,
  };
});
