import { defineConfig } from "vitest/config";

// Unit tests for the app's own access rules and device sessions; no VoidAuth needed.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
