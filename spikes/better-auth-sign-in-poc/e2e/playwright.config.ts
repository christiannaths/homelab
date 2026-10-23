import { defineConfig, devices, type LaunchOptions } from "@playwright/test";

export const launchOptions: LaunchOptions = {
  // Optional: point at an already-installed Chromium instead of `npx playwright install`.
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
  args: [
    // *.home.test is the gateway on this machine; no DNS or hosts file needed.
    "--host-resolver-rules=MAP *.home.test 127.0.0.1",
    "--no-proxy-server",
    // Trusts the gateway's self-signed CA. ignoreHTTPSErrors alone isn't enough: Chromium still
    // refuses to register a service worker from a site with a certificate error. Global setup
    // sets the variable, and workers load this file again after it runs.
    ...(process.env.GATEWAY_CA_SPKI
      ? [`--ignore-certificate-errors-spki-list=${process.env.GATEWAY_CA_SPKI}`]
      : []),
  ],
};

// One stack (compose.yaml) for the whole run, set up in global setup. Tests run one at a time:
// some change a person's grants, and one uses up the sign-in rate limit for a while.
export default defineConfig({
  testDir: "tests",
  globalSetup: "./tests/global-setup.ts",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
    launchOptions,
  },
});
