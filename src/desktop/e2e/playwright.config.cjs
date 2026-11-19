const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: '*.spec.cjs',
  outputDir: '.results',
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: 'list',
});
