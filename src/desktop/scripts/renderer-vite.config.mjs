import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scripts = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.KS_RENDERER_SOURCE_ROOT || path.resolve(scripts, '../../..');
const require = createRequire(path.join(root, 'src/web/package.json'));
const { loadConfigFromFile, mergeConfig } = require('vite');
const { rendererPolicyPlugin } = createRequire(import.meta.url)('./build-renderer.cjs');

export default async (configEnv) => {
  const loaded = await loadConfigFromFile(configEnv, path.join(root, 'src/web/vite.config.ts'));
  if (!loaded) throw new Error('Desktop renderer Vite configuration is missing');
  return mergeConfig(loaded.config, { plugins: [rendererPolicyPlugin(root)] });
};
