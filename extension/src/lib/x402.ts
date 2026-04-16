/**
 * KeyShield Agentic — X402Handler
 *
 * Handles the x402 payment protocol from the content script side.
 * Content script detects 402 responses; payment signing happens in background.ts
 * (which has the Solana connection and wallet session).
 *
 * x402 protocol: https://x402.org
 * When a server returns HTTP 402 with X-Payment-Required: x402 headers,
 * the client should:
 *   1. Parse payment requirements from headers
 *   2. Sign a payment transaction with a nonce to prevent replay
 *   3. Retry the original request with X-Payment-Proof header
 *
 * In this extension: content.ts detects 402 → sends INITIATE_PAYMENT to background
 * → background signs + retries for fetch requests (XHR cannot be retried the same way).
 */

export interface X402Payment {
  /** USDC amount required */
  amount: number;
  /** Service description */
  memo: string;
  /** URL that returned 402 */
  url: string;
  /** Payment mode */
  mode?: 'streaming' | 'once';
}

export interface X402PaymentProof {
  /** Solana transaction signature */
  signature: string;
  /** Payment amount */
  amount: number;
  /** Nonce — millisecond timestamp to prevent replay */
  nonce: number;
  /** Payer wallet pubkey */
  payer: string;
  /** x402 protocol version */
  version: '1';
}

export interface X402Result {
  success: boolean;
  proof?: X402PaymentProof;
  error?: string;
}

/**
 * X402Handler — lifecycle object that content.ts creates on init.
 * Actual payment signing is delegated to background.ts; this class is a
 * thin coordinator (state tracking, auto-pay logic).
 */
export class X402Handler {
  private pendingPayments = new Map<string, X402Payment>();

  /**
   * Check whether a 402 response has x402 protocol headers.
   */
  static isX402(headers: Headers): boolean {
    return headers.get('X-Payment-Required') === 'x402' && !!headers.get('X-Payment-Amount');
  }

  /**
   * Parse payment details from 402 response headers.
   */
  static parseFromHeaders(response: Response): X402Payment | null {
    const amountRaw = response.headers.get('X-Payment-Amount');
    if (!amountRaw) return null;
    const amount = parseFloat(amountRaw);
    if (isNaN(amount) || amount <= 0) return null;

    return {
      amount,
      memo: response.headers.get('X-Payment-Memo') || 'API Payment',
      url: response.url,
    };
  }

  /**
   * Register a pending payment (so we can show a single prompt for a URL).
   */
  addPending(payment: X402Payment): void {
    this.pendingPayments.set(payment.url, payment);
  }

  hasPending(url: string): boolean {
    return this.pendingPayments.has(url);
  }

  clearPending(url: string): void {
    this.pendingPayments.delete(url);
  }

  clearAll(): void {
    this.pendingPayments.clear();
  }
}

/**
 * Build a base64-encoded payment proof payload for the X-Payment-Proof header.
 * The proof is signed by background.ts; this function assembles the pre-image.
 *
 * Format: base64({ version, amount, url, nonce, payer, signature })
 */
export function buildPaymentProofPayload(
  payment: X402Payment,
  payer: string,
): { preimage: string; nonce: number } {
  const nonce = Date.now();
  const preimage = JSON.stringify({
    version: '1',
    amount: payment.amount,
    url: payment.url,
    memo: payment.memo,
    nonce,
    payer,
  });
  return { preimage, nonce };
}

/**
 * Encode a payment proof for use as the X-Payment-Proof header value.
 * Called by background.ts after signing.
 */
export function encodePaymentProof(proof: X402PaymentProof): string {
  return btoa(JSON.stringify(proof));
}

/**
 * Decode a payment proof header value.
 */
export function decodePaymentProof(encoded: string): X402PaymentProof | null {
  try {
    return JSON.parse(atob(encoded)) as X402PaymentProof;
  } catch {
    return null;
  }
}
