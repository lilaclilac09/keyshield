import { encrypt, decrypt } from '../crypto/aes-gcm';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const VAULT_PATH = join(process.env.VAULT_DIR ?? '.', '.keyshield-vault.json');

type VaultData = Record<string, string>;

export function storeKey(name: string, apiKey: string, password: string): void {
  const vault: VaultData = existsSync(VAULT_PATH) 
    ? JSON.parse(readFileSync(VAULT_PATH, 'utf8')) 
    : {};
  vault[name] = encrypt(apiKey, password);
  writeFileSync(VAULT_PATH, JSON.stringify(vault, null, 2));
}

export function loadKey(name: string, password: string): string {
  if (!existsSync(VAULT_PATH)) throw new Error('Vault not found');
  const vault: VaultData = JSON.parse(readFileSync(VAULT_PATH, 'utf8'));
  if (!vault[name]) throw new Error(`Key "${name}" not in vault`);
  return decrypt(vault[name], password);
}
