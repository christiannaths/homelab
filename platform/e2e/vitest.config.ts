import { defineConfig } from "vitest/config";

// Runs against the gateway, the accounts service, Notes and the Encyclopedia (compose.yaml),
// started once in global setup. Files run one at a time, since every file starts Home on the same
// port.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 300_000,
  },
});
