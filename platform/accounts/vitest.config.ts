import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Each sign-in hashes a password with scrypt, which takes several times longer while
    // `npm run check` runs the other projects' tasks alongside.
    testTimeout: 20_000,
  },
});
