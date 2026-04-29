/**
 * x402 payment-response handler for the content-script.
 *
 * The real handler intercepts HTTP 402 responses, reads the
 * X-Payment-Required / X-Payment-Amount headers, and forwards them to
 * the background service-worker which talks to the Solana program.
 *
 * Today this is a thin descriptor + a parser for headers — enough for
 * content.ts to compile and for unit tests to assert payment intents
 * are recognised. Wiring to the on-chain program lives in the
 * background script (out of this file's scope).
 */

export interface X402PaymentIntent {
  amount: number;
  currency: 'USDC' | 'SOL';
  memo: string;
  url: string;
}

export class X402Handler {
  /**
   * Parse a 402 response into a payment intent. Returns null if the
   * response doesn't carry the headers we recognise.
   */
  parse(response: Response): X402PaymentIntent | null {
    const required = response.headers.get('X-Payment-Required');
    const amountStr = response.headers.get('X-Payment-Amount');
    if (required !== 'x402' || !amountStr) return null;

    const amount = Number.parseFloat(amountStr);
    if (!Number.isFinite(amount) || amount <= 0) return null;

    const currency = (response.headers.get('X-Payment-Currency') ?? 'USDC') as
      | 'USDC'
      | 'SOL';
    const memo = response.headers.get('X-Payment-Memo') ?? 'API Payment';

    return { amount, currency, memo, url: response.url };
  }
}
