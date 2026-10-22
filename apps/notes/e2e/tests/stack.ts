// The homelab around Notes (compose.yaml) and the people the tests sign in as. A browser reaches
// everything through the gateway on GATEWAY_PORT, as a browser on the home network would.
import { execFile } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { startServer, type NotesServer } from "@homelab/notes-server";
import { chromium, type Browser, type Page } from "playwright";

const run = promisify(execFile);
const COMPOSE_FILE = fileURLToPath(new URL("../compose.yaml", import.meta.url));
/** The client's production build: the service worker exists only there. */
const CLIENT_DIR = fileURLToPath(new URL("../../web/dist", import.meta.url));

export const GATEWAY_PORT = 8463;
/** Where the Notes server listens on this machine; only the gateway is meant to reach it. */
export const NOTES_PORT = 4120;
export const DOMAIN = "home.test";
export const ACCOUNTS_URL = `https://accounts.${DOMAIN}:${GATEWAY_PORT}`;
export const NOTES_URL = `https://notes.${DOMAIN}:${GATEWAY_PORT}`;
/** VoidAuth's session cookie, on the parent domain. */
export const VOIDAUTH_SESSION_COOKIE = "x-voidauth-session";

/** The instance admin VoidAuth creates on first run. */
export const ADMIN = {
  username: "auth_admin",
  password: "violet-quartz-harbour-71",
};

export interface Account {
  username: string;
  password: string;
  name: string | null;
  /** The homelab admin's grants: `notes` lets a person in, `notes-admins` as an owner. */
  groups: string[];
}

export const ADA: Account = {
  username: "ada",
  password: "lantern-meadow-copper-48",
  name: "Ada Lovelace",
  groups: ["notes-admins"],
};
export const DANA: Account = {
  username: "dana",
  password: "quartz-ember-willow-27",
  name: "Dana Scully",
  groups: ["notes"],
};
/** Has a homelab account but was not given Notes. */
export const BOB: Account = {
  username: "bob",
  password: "harbour-violet-thistle-93",
  name: "Bob Ross",
  groups: [],
};
/** Has no name, so VoidAuth sends no Remote-Name for her. */
export const EVE: Account = {
  username: "eve",
  password: "ember-thistle-lantern-62",
  name: null,
  groups: ["notes"],
};
export const ACCOUNTS = [ADA, DANA, BOB, EVE];
export const NOTES_GROUPS = ["notes", "notes-admins"];

export async function compose(
  env: Record<string, string>,
  ...args: string[]
): Promise<string> {
  const { stdout, stderr } = await run(
    "docker",
    ["compose", "-f", COMPOSE_FILE, ...args],
    { env: { ...process.env, ...env }, maxBuffer: 16 * 1024 * 1024 },
  );
  return stdout + stderr;
}

export function startNotes(): Promise<NotesServer> {
  return startServer({
    dataDir: mkdtempSync(path.join(tmpdir(), "notes-e2e-")),
    port: NOTES_PORT,
    voidauthUrl: ACCOUNTS_URL,
    clientDir: CLIENT_DIR,
  });
}

/** `gatewayCaSpki` is the hash of the gateway's CA key, which global setup provides. */
export function launchChromium(gatewayCaSpki: string): Promise<Browser> {
  return chromium.launch({
    // Points at an already-installed Chromium where Playwright's own download is not available.
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
    args: [
      // *.home.test is the gateway on this machine; no DNS or hosts file needed.
      `--host-resolver-rules=MAP *.${DOMAIN} 127.0.0.1`,
      "--no-proxy-server",
      // Trusts the gateway's self-signed CA. Ignoring HTTPS errors alone is not enough: Chromium
      // still refuses to register a service worker from a site with a certificate error.
      `--ignore-certificate-errors-spki-list=${gatewayCaSpki}`,
    ],
  });
}

/** One browser profile: its own cookies, storage and service worker, like a separate device. */
export async function newDevice(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  return context.newPage();
}

/** Resolves once the page has arrived on VoidAuth's sign-in page. */
export function onVoidAuthSignIn(page: Page): Promise<void> {
  return page.waitForURL(
    (url) => url.origin === ACCOUNTS_URL && url.pathname === "/login",
  );
}

/** Types a password on VoidAuth's sign-in page, which the page must already be on. */
export async function typePassword(
  page: Page,
  account: Pick<Account, "username" | "password">,
): Promise<void> {
  await page.getByLabel("Username or Email").fill(account.username);
  await page.getByLabel("Password", { exact: true }).fill(account.password);
  await page.getByRole("button", { name: "Login", exact: true }).click();
  // VoidAuth offers to set up a passkey after a password sign-in; a person would skip it.
  const skip = page.getByRole("button", { name: "Skip", exact: true });
  const offered = await Promise.race([
    skip.waitFor().then(() => true),
    page
      .waitForURL((url) => !url.pathname.startsWith("/login"))
      .then(() => false),
  ]).catch(() => false);
  if (offered) await skip.click();
}

/** Opens Notes and signs in on VoidAuth's page; resolves once the protected page shows. */
export async function signIn(page: Page, account: Account): Promise<void> {
  await page.goto(NOTES_URL);
  await onVoidAuthSignIn(page);
  await typePassword(page, account);
  await page.getByText("Signed in as").waitFor();
}

/** Waits until the service worker controls the page, so the app can start offline. */
export async function waitUntilOfflineReady(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
}

/** Answers Yes on VoidAuth's "sign out?" page, which the browser must be on or on its way to. */
export async function confirmSignOut(page: Page): Promise<void> {
  await page.waitForURL(
    (url) => url.origin === ACCOUNTS_URL && url.pathname.startsWith("/logout"),
  );
  await page.getByRole("button", { name: "Yes", exact: true }).click();
}
