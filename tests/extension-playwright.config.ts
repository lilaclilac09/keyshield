import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './extension-browser',
  testMatch: '**/*.pw.ts',
  workers: 1,
  timeout: 45000,
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
});
