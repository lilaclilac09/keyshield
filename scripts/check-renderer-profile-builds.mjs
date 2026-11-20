import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { checkMasFixtureDist, distText } from './check-mas-fixture-dist.mjs';

const [standard, fixture] = process.argv.slice(2);
if (!standard || !fixture) throw new Error('Usage: node scripts/check-renderer-profile-builds.mjs STANDARD_DIST MAS_DIST');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
assert.deepEqual(JSON.parse(await readFile(path.join(standard, 'renderer-profile.json'), 'utf8')), { profile: 'standard', commit });
assert.equal(/FAKE_KEYSHIELD_NOT_A_KEY::|KeyShield synthetic fixture|fixture-entry|fixture-unlock/.test(await distText(standard)), false, 'Fixture-only value and UI must be absent from the standard build');
console.log(`Standard dist PASS: profile=standard commit=${commit}; fixture value and UI absent.`);
await checkMasFixtureDist(fixture, commit);
