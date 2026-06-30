/**
 * MPP wallet sign-off helpers — convert /build-open-tx JSON into ix order.
 * Mirrors packages/shared/src/lib/wallet-mpp.ts (no monorepo dep in web).
 */

import type { BuildTxResponse } from './solana';

export interface MppBuildOpenTxResponse extends BuildTxResponse {
  streamUsdcAta: string;
  prereqIxs: [BuildTxResponse, BuildTxResponse];
}

export function assembleOpenTxIxsForSign(response: MppBuildOpenTxResponse): BuildTxResponse[] {
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

export function decodeIxData(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
