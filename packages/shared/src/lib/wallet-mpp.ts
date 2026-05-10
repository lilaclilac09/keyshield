/**
 * MPP wallet sign-off helpers — convert /build-open-tx server JSON
 * into ix shapes a wallet adapter can sign.
 *
 * The server returns a 3-ix bundle (one main + two prereqs); this
 * module is the minimal logic that explains the *order* you must add
 * them to a Solana Transaction and the byte-level decoding callers
 * usually need. It deliberately does NOT depend on @solana/web3.js
 * (or any specific version of it) so it works from web v1, web v2,
 * Node CLI scripts, and React Native.
 *
 * If you need a Transaction object, do something like:
 *
 *   import { Transaction, TransactionInstruction, PublicKey } from '@solana/web3.js';
 *   import { assembleOpenTxIxsForSign, decodeIxData } from '@keyshield/shared/lib/wallet-mpp';
 *
 *   const ixsJson = assembleOpenTxIxsForSign(response);
 *   const ixs = ixsJson.map(j => new TransactionInstruction({
 *     programId: new PublicKey(j.programId),
 *     keys: j.keys.map(k => ({ pubkey: new PublicKey(k.pubkey), isSigner: k.isSigner, isWritable: k.isWritable })),
 *     data: Buffer.from(decodeIxData(j.data)),
 *   }));
 *   const tx = new Transaction().add(...ixs);
 *   await wallet.sendTransaction(tx, connection);
 */

import type {
  MppBuildOpenTxResponseRuntime,
  MppBuildTxIxRuntime,
} from '../types';

/**
 * Return the prereq + main ixs in the order a wallet must sign them.
 *
 * The wire contract (mirrored in the server route mpp.py and the
 * scripts/pay.sh --build-tx-only block):
 *   [0] Create stream-PDA-owned USDC ATA (idempotent, SPL ATA disc 1)
 *   [1] TransferChecked: owner's USDC ATA → stream ATA
 *   [2] open_payment_stream (KeyShield ix #24)
 *
 * Without #0 and #1, mpp_settle's later PDA-signed transfer hits
 * SPL Token error 0x4 (OwnerMismatch). Verified on devnet 2026-05-10.
 */
export function assembleOpenTxIxsForSign(
  response: MppBuildOpenTxResponseRuntime,
): MppBuildTxIxRuntime[] {
  return [
    response.prereqIxs[0],
    response.prereqIxs[1],
    {
      programId: response.programId,
      keys: response.keys,
      data: response.data,
    },
  ];
}

/**
 * Decode a base64-encoded ix data string into raw bytes.
 *
 * Server side encodes via Python `base64.b64encode(ix.data).decode("ascii")`
 * — standard base64 with `=` padding, no URL-safe substitutions.
 *
 * In a browser environment we use `atob`. For Node + jsdom test
 * harnesses, fall back to `Buffer.from(s, 'base64')`.
 */
export function decodeIxData(b64: string): Uint8Array {
  if (typeof atob === 'function') {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  // Node fallback (e.g. running tests under vitest with jsdom-omitted env).
  // Buffer is a Uint8Array under the hood, so this is just a type narrow.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Buffer } = require('buffer');
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

/**
 * Convenience: how many lamports of rent the prereq Create-ATA ix
 * will pull from the owner's wallet (rough — for UI hints only).
 *
 * SPL ATA on Solana costs ~0.00204 SOL (2,039,280 lamports) of rent
 * for the new account. The server doesn't compute this exactly; this
 * constant is the standard 165-byte token account rent at the going
 * rate as of 2026-05.
 */
export const APPROX_ATA_RENT_LAMPORTS = 2_039_280;
