import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROVIDER_ORIGINS } from './lib/policy.js';

const source = dirname(fileURLToPath(import.meta.url));
const destination = resolve(process.argv[2] || 'dist/extension');
if (destination === source || source.startsWith(`${destination}/`) || destination.startsWith(`${source}/lib`)) throw new Error('Choose a separate output directory');
await mkdir(destination, { recursive: true });
await rm(resolve(destination, 'lib'), { recursive: true, force: true });
for (const file of ['background.js', 'browser-api.js', 'popup.js', 'popup.html', 'confirm.html', 'lib']) {
  await cp(resolve(source, file), resolve(destination, file), { recursive: true });
}
const manifest = JSON.parse(await readFile(resolve(source, 'manifest.json'), 'utf8'));
manifest.optional_host_permissions = PROVIDER_ORIGINS.map((origin) => `${origin}/*`);
await writeFile(resolve(destination, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Extension resources: ${destination}`);
