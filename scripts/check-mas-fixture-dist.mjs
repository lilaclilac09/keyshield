import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function distText(directory) {
  const parts = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    parts.push(entry.isDirectory() ? await distText(file) : await readFile(file, 'utf8'));
  }
  return parts.join('\n');
}

export async function checkMasFixtureDist(directory, commit) {
  const marker = JSON.parse(await readFile(path.join(directory, 'renderer-profile.json'), 'utf8'));
  assert.deepEqual(marker, { profile: 'mas-fixture', commit }, 'Fixture marker must match the pin');
  assert.match(commit, /^[0-9a-f]{40}$/);
  const text = await distText(directory);
  for (const forbidden of [
    /keyshield-production\.up\.railway\.app/i, /sync\.ks\.aileena\.xyz/i,
    /app\.ks\.aileena\.xyz/i, /accounts\.google\.com/i, /unpkg\.com/i,
    /https?:[^\s"'<>]*(?:font|typekit)/i, /@import\s/i, /@font-face/i,
    /broker|approval/i,
    /password-login-input|KeyShield password|Add Key|key-paste|\/auth\/signup|\/manage\/store/i,
    /<input|<textarea|contenteditable|onpaste|clipboard|FileReader|\.files\b/i,
    /\b(?:sk-|gsk_|ksv2_|ghp_|AKIA|AIza)[A-Za-z0-9_-]{12,}/,
  ]) assert.doesNotMatch(text, forbidden, `Forbidden fixture dist content: ${forbidden}`);
  assert.ok(text.includes('FAKE_KEYSHIELD_NOT_A_KEY::'), 'Expected only the explicitly fake fixture key');
  assert.deepEqual([...new Set(text.match(/FAKE_KEYSHIELD_NOT_A_KEY::[A-Za-z0-9_:.-]+/g))], ['FAKE_KEYSHIELD_NOT_A_KEY::demo'], 'Only the exact Demo key value may be bundled');
  assert.match(text, /connect-src 'none'/);
  console.log(`MAS dist PASS: profile=mas-fixture commit=${commit}; no forbidden endpoints, fonts, credential UI, unsafe key-like values or integration strings.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await checkMasFixtureDist(path.resolve(process.argv[2] ?? 'src/web/dist'), process.argv[3] ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim());
}
