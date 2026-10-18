import { defineConfig } from "vitest/config";

// Runs against the real VoidAuth image (compose.yaml), started once in global setup.
// Files run one at a time: one of them stops and restarts VoidAuth.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
