import { defineConfig } from "vitest/config";

// Runs against the gateway and the real VoidAuth image (compose.yaml), started once in global
// setup. Files run one at a time, since every file starts Notes on the same port.
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
