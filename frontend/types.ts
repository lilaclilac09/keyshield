
export type VaultItemType = 'api_key' | 'password' | 'wallet_seed' | 'private_key';

export interface VaultItem {
  id: string;
  name: string;
  type: VaultItemType;
  value: string;
  domain?: string;
  createdAt: number;
  lastUsedAt: number;
  tags: string[];
  notes?: string;
  expiryDate?: string;
}

export interface AuditLog {
  id: string;
  action: string;
  timestamp: number;
  details: string;
  status: 'success' | 'warning' | 'error';
}

export enum ViewMode {
  POPUP = 'POPUP',
  DASHBOARD = 'DASHBOARD'
}
