import { defineConfig } from '@playwright/test';

const useExternalServer = process.env.PW_USE_EXTERNAL_SERVER === '1';
const port = Number(process.env.PW_PORT ?? 5173);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
  },
  ...(useExternalServer
    ? {}
    : {
        webServer: {
          command: `npm --prefix frontend run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
          url: `http://127.0.0.1:${port}`,
          reuseExistingServer: !process.env.CI,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      }),
});
