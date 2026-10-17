import { defineConfig } from "vitest/config";

// Unit tests of the pure model: the page tree, the people rules and the access rules.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // lib0 (a Yjs dependency) probes localStorage; Node 26 warns unless web storage is off.
    execArgv: ["--no-experimental-webstorage"],
  },
});
