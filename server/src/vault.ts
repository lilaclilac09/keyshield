import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

const VAULT_PATH = join(process.env.VAULT_DIR ?? '.', '.keyshield-vault.json')
const SALT = Buffer.from('keyshield-salt-v1')

function deriveKey(password: string): Buffer {
  return scryptSync(password, SALT, 32) as Buffer
}

export function encrypt(plaintext: string, password: string): string {
  const key = deriveKey(password)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return JSON.stringify({ iv: iv.toString('hex'), tag: tag.toString('hex'), data: encrypted.toString('hex') })
}

export function decrypt(ciphertext: string, password: string): string {
  const key = deriveKey(password)
  const { iv, tag, data } = JSON.parse(ciphertext)
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'))
  decipher.setAuthTag(Buffer.from(tag, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]).toString('utf8')
}

type VaultData = Record<string, string>

export function storeKey(name: string, apiKey: string, password: string): void {
  const vault: VaultData = existsSync(VAULT_PATH) ? JSON.parse(readFileSync(VAULT_PATH, 'utf8')) : {}
  vault[name] = encrypt(apiKey, password)
  writeFileSync(VAULT_PATH, JSON.stringify(vault, null, 2))
}

export function loadKey(name: string, password: string): string {
  if (!existsSync(VAULT_PATH)) throw new Error('Vault not found')
  const vault: VaultData = JSON.parse(readFileSync(VAULT_PATH, 'utf8'))
  if (!vault[name]) throw new Error(`Key "${name}" not in vault`)
  return decrypt(vault[name], password)
}
