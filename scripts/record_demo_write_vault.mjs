#!/usr/bin/env node
/** Write a ks-vault .enc file for ks-proxy `dev-bypass` (PBKDF2 + AES-256-GCM). */
import { pbkdf2Sync, createCipheriv, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const dest = process.argv[2];
const password = process.argv[3] || "dev-bypass";
const plaintext = process.argv[4] || "sk-record-demo-vault";
if (!dest) {
  process.stderr.write("usage: record_demo_write_vault.mjs <path.enc> [password] [plaintext]\n");
  process.exit(2);
}

const salt = randomBytes(16);
const nonce = randomBytes(12);
const key = pbkdf2Sync(password, salt, 100_000, 32, "sha256");
const cipher = createCipheriv("aes-256-gcm", key, nonce);
const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final(), cipher.getAuthTag()]);
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, Buffer.concat([salt, nonce, body]));
process.stdout.write(`wrote ${dest}\n`);
