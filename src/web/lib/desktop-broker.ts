export interface BrokerAgent {
  agentId: string;
  name: string;
  revoked: boolean;
}

export interface BrokerRequest {
  id: string;
  agentId: string;
  agent: string;
  credential: string;
  operation: string;
  description: string;
  status: string;
  expires_at: number;
  created_at: number;
  updated_at: number;
  error?: string;
}

export interface DesktopBroker {
  listAgents(): Promise<BrokerAgent[]>;
  registerAgent(name: string): Promise<{ agentId: string; name: string; token: string; brokerUrl: string }>;
  revokeAgent(agentId: string): Promise<void>;
  listRequests(): Promise<BrokerRequest[]>;
  deny(id: string): Promise<void>;
  revokeRequest(id: string): Promise<void>;
  beginApproval(requestId: string): Promise<{
    challenge: string; credentialId: string; rpId: string;
    binding: { requestId: string; agentId: string; agentName: string; entryId: string; operation: string; destination: string };
  }>;
  approve(payload: { requestId: string; assertion: unknown; secret: string }): Promise<unknown>;
  pinApprovalPasskey(payload: { response: unknown; expectedChallenge: string }): Promise<void>;
  onChanged(cb: () => void): () => void;
}
