import { defineConfig } from 'vitest/config';
import {
  defineWorkersConfig,
  readD1Migrations,
} from '@cloudflare/vitest-pool-workers/config';

// Run worker tests inside a real workerd runtime via Miniflare so we
// hit the actual R2 binding behaviour, not a mock.
export default defineWorkersConfig({
  // Resolve packages like `jose` to their Workers build. Without this the
  // pool picks jose's Node entry (node:https) and every test file fails to load.
  // cross-fetch (via @simplewebauthn/server) has no exports map, so point it at
  // its browser ponyfill the way wrangler's bundler does in production.
  resolve: {
    conditions: ['workerd', 'worker', 'browser'],
    alias: { 'cross-fetch': 'cross-fetch/dist/browser-ponyfill.js' },
  },
  ssr: { resolve: { conditions: ['workerd', 'worker', 'browser'] } },
  test: {
    include: ['test/**/*.test.ts'],
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          // Override the JWT secret in tests so we don't accidentally
          // ship the dev value baked into wrangler.toml.
          bindings: {
            JWT_SECRET: 'test-secret-must-be-32-chars-or-more-for-hs256!',
            JWT_ISSUER: 'keyshield-sync-test',
            MAX_VAULT_BYTES: '4096',
          },
          r2Buckets: {
            VAULTS: 'test-vaults',
            REGISTRY: 'test-registry',
          },
        },
      },
    },
  },
});
