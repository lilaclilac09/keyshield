export type VaultItemType = 'api_key' | 'password' | 'note' | 'env' | 'ssh_key';

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

export interface PasswordPayload {
  username: string;
  password: string;
  url?: string;
  notes?: string;
}

export interface NotePayload {
  title: string;
  content: string;
}

export interface EnvPayload {
  vars: { key: string; value: string }[];
  notes?: string;
}

export interface SSHKeyPayload {
  publicKey: string;
  privateKey: string;
  passphrase?: string;
  comment?: string;
}

export const TYPE_PREFIX: Record<Exclude<VaultItemType, 'api_key'>, string> = {
  password: 'pw__',
  note: 'note__',
  env: 'env__',
  ssh_key: 'ssh__',
};

export function inferType(slug: string): VaultItemType {
  if (slug.startsWith('pw__')) return 'password';
  if (slug.startsWith('note__')) return 'note';
  if (slug.startsWith('env__')) return 'env';
  if (slug.startsWith('ssh__')) return 'ssh_key';
  return 'api_key';
}
