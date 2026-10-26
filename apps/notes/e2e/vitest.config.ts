import { defineConfig } from "vitest/config";

// Each file starts its own Notes and front door on free ports. Nx builds the web client before
// this suite starts (implicitDependencies in package.json), outside Vitest, whose NODE_ENV of
// test would build it without its service worker.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
