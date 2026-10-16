import { defineConfig } from "vitest/config";

// Unit tests cover the pure model (tree, ordering, database views) in Node. UI is covered by Playwright.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // lib0 (a Yjs dependency) probes localStorage; Node 26 warns unless web storage is off.
    execArgv: ["--no-experimental-webstorage"],
  },
});
