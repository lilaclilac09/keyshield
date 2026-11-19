import { approveWithPasskey } from './auth';

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
  port: number;
  listAgents(): Promise<BrokerAgent[]>;
  registerAgent(name: string): Promise<{ agentId: string; name: string; token: string }>;
  revokeAgent(agentId: string): Promise<void>;
  listRequests(): Promise<BrokerRequest[]>;
  deny(id: string): Promise<void>;
  revokeRequest(id: string): Promise<void>;
  approve(payload: {
    id: string; agentId: string; credential: string; operation: string; secret: string;
  }): Promise<unknown>;
  onChanged(cb: () => void): () => void;
}

export async function approveBrokerRequest(broker: DesktopBroker, request: BrokerRequest): Promise<void> {
  const secret = await approveWithPasskey(request.credential);
  await broker.approve({
    id: request.id,
    agentId: request.agentId,
    credential: request.credential,
    operation: request.operation,
    secret,
  });
}
