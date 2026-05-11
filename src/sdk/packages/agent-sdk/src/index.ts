import { Connection, PublicKey } from '@solana/web3.js';

import { KeyShieldHttp } from './http-client';
import { SessionManager } from './session';
import { X402Client } from './x402';

export { KeyShieldHttp } from './http-client';
export type { KeyShieldHttpConfig, ProxyCallOptions } from './http-client';

export {
  SessionManager,
  parseActiveSessions,
  encodeGrantAgentAccessData,
  encodeRevokeAgentAccessData,
  deriveUniversalVaultPda,
  isSessionExpired,
  VAULT_LAYOUT,
  IX,
  DEFAULT_SESSION_DURATION_SECS,
} from './session';
export type { SessionInfo, GrantSessionParams, SessionManagerConfig } from './session';

export { X402Client } from './x402';
export type { X402PaymentDetails, StreamState } from './x402';

export { KeyGroup, PolicyRuleType } from './types';

export interface KeyShieldAgentConfig {
  apiUrl?: string;
  keypair?: { publicKey: Uint8Array; secretKey: Uint8Array };
  programId?: string;
  rpcUrl?: string;
}

export async function createAgent(config: KeyShieldAgentConfig): Promise<{
  http: KeyShieldHttp;
  x402: X402Client;
  session: SessionManager | null;
  pubkeyB58: string;
}> {
  const keypair = config.keypair ?? KeyShieldHttp.generateKeypair();

  const http = new KeyShieldHttp({ apiUrl: config.apiUrl, keypair });

  const pubkeyB58 = KeyShieldHttp.pubkeyToB58(keypair.publicKey);
  const token = await http.login(pubkeyB58);

  const x402 = new X402Client(config.apiUrl);
  x402.setToken(token);

  let session: SessionManager | null = null;
  if (config.programId && config.rpcUrl) {
    const connection = new Connection(config.rpcUrl);
    const programId = new PublicKey(config.programId);
    const ownerPubkey = PublicKey.default;
    session = new SessionManager({ connection, programId, ownerPubkey });
  }

  return { http, x402, session, pubkeyB58 };
}
