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
  approvalStatus(): Promise<{ available: boolean }>;
  invalidateApprovals(): Promise<void>;
  listAgents(): Promise<BrokerAgent[]>;
  registerAgent(name: string): Promise<{ agentId: string; name: string; token: string; brokerUrl: string }>;
  revokeAgent(agentId: string): Promise<void>;
  listRequests(): Promise<BrokerRequest[]>;
  deny(id: string): Promise<void>;
  revokeRequest(id: string): Promise<void>;
  beginApproval(payload: { requestId: string; snapshot: ApprovalSnapshot }): Promise<{
    challenge: string; credentialId: string; rpId: string;
    binding: { requestId: string; agentId: string; agentName: string; entryId: string; operation: string; destination: string; snapshot: ApprovalSnapshot };
  }>;
  approve(payload: { requestId: string; assertion: unknown; secret: string; snapshot: ApprovalSnapshot }): Promise<unknown>;
  pinApprovalPasskey(payload: { response: unknown }): Promise<void>;
  onChanged(cb: () => void): () => void;
}

export interface ApprovalSnapshot {
  vaultId: string;
  revision: number;
  entryId: string;
  metadata: Record<string, unknown>;
}
