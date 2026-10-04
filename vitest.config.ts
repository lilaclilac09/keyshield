import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "tests/adversarial_audit.ts",
      "tests/bankrun_security.test.ts",
      "**/*.{test,spec}.?(c|m)[jt]s?(x)",
    ],
    testTimeout: 120000,
  },
});
