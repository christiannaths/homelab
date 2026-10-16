import { defineConfig } from "vitest/config";

// Sync-boundary tests: each file starts a real server process and connects test clients to it.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "testing/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // lib0 (a Yjs dependency) probes localStorage; Node 26 warns unless web storage is off.
    execArgv: ["--no-experimental-webstorage"],
  },
});
