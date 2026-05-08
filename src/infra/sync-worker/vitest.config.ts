import { defineConfig } from 'vitest/config';
import {
  defineWorkersConfig,
  readD1Migrations,
} from '@cloudflare/vitest-pool-workers/config';

// Run worker tests inside a real workerd runtime via Miniflare so we
// hit the actual R2 binding behaviour, not a mock.
export default defineWorkersConfig({
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
