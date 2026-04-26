/**
 * BIP-39 mnemonic recovery phrase.
 *
 * The 24-word phrase is the **ultimate root of recovery**. If a user
 * loses every device that has the synced passkey, they can still
 * reconstruct the vault from these words alone — neither
 * KeyShield's servers nor anyone but the user can do this.
 *
 * Wraps @scure/bip39 with the project's terminology (`seed`, the
 * 32-byte master secret) and asserts on the parts of the API we
 * actually exercise. We use the English wordlist; localising the
 * wordlist would orphan every existing recovery phrase, so it's
 * frozen for the lifetime of v2 vaults.
 */

import {
  generateMnemonic as bip39GenerateMnemonic,
  mnemonicToEntropy,
  entropyToMnemonic,
  validateMnemonic as bip39ValidateMnemonic,
} from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

/**
 * 256 bits of entropy → 24 words. We do NOT support 12-word phrases —
 * 128-bit entropy is fine for keys but a 24-word phrase is the
 * convention for "long-term root secret" UX (Solana, Ethereum HW
 * wallets, iCloud Keychain Recovery Key all use 24-equivalent).
 */
const ENTROPY_BITS = 256;

/** Generate a fresh 24-word recovery phrase. */
export function generateMnemonic(): string {
  return bip39GenerateMnemonic(wordlist, ENTROPY_BITS);
}

/**
 * Recover a 32-byte seed from a previously-generated mnemonic.
 *
 * Throws if the phrase has the wrong word count, contains an unknown
 * word, or fails the BIP-39 checksum byte. The thrown error is safe
 * to surface to the user — it doesn't leak which word was wrong.
 */
export function mnemonicToSeed(phrase: string): Uint8Array {
  const cleaned = normalizePhrase(phrase);
  if (!bip39ValidateMnemonic(cleaned, wordlist)) {
    throw new InvalidMnemonicError();
  }
  const entropy = mnemonicToEntropy(cleaned, wordlist);
  if (entropy.length !== 32) {
    throw new InvalidMnemonicError();
  }
  return entropy;
}

/** Convert a 32-byte seed back into the canonical 24-word phrase. */
export function seedToMnemonic(seed: Uint8Array): string {
  if (seed.length !== 32) {
    throw new Error(`seed must be 32 bytes, got ${seed.length}`);
  }
  return entropyToMnemonic(seed, wordlist);
}

/** True iff the input is a valid 24-word English BIP-39 phrase. */
export function isValidMnemonic(phrase: string): boolean {
  return bip39ValidateMnemonic(normalizePhrase(phrase), wordlist);
}

/**
 * Normalise user input — collapse whitespace, lowercase, strip stray
 * punctuation. Keeping this strict reduces surprise: "Abandon"
 * pasted from a website still works, "abandon," with a comma still
 * works, but a typo doesn't.
 */
export function normalizePhrase(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .join(' ');
}

export class InvalidMnemonicError extends Error {
  constructor() {
    super(
      'Recovery phrase is invalid. Check that all 24 words are spelled ' +
        'correctly and in the right order.',
    );
    this.name = 'InvalidMnemonicError';
  }
}
