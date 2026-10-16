import { defineConfig, devices } from "@playwright/test";

// Two-browser tests against the production build (the service worker only exists there).
// Each test starts its own server process (TestServer from the server's testing helpers),
// so it can stop and restart it.
export default defineConfig({
  testDir: "tests",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
    // Optional: point at an already-installed Chromium instead of `npx playwright install`.
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined },
  },
});
