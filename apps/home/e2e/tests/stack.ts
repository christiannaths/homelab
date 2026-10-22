// The homelab around Home (compose.yaml) and the people the tests sign in as. A browser reaches
// everything through the gateway on GATEWAY_PORT, as a browser on the home network would.
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { startServer, type HomeServer } from "@homelab/home-server";
import { chromium, type Browser, type Page } from "playwright";

const run = promisify(execFile);
const COMPOSE_FILE = fileURLToPath(new URL("../compose.yaml", import.meta.url));
/** The client's production build: the service worker exists only there. */
const CLIENT_DIR = fileURLToPath(new URL("../../web/dist", import.meta.url));

export const GATEWAY_PORT = 8473;
/** Where the Home server listens on this machine; only the gateway is meant to reach it. */
export const HOME_PORT = 4130;
export const DOMAIN = "home.test";
const appUrl = (app: string) => `https://${app}.${DOMAIN}:${GATEWAY_PORT}`;
export const ACCOUNTS_URL = appUrl("accounts");
export const HOME_URL = appUrl("home");
export const NOTES_URL = appUrl("notes");
export const ENCYCLOPEDIA_URL = appUrl("encyclopedia");
/** VoidAuth's session cookie, on the parent domain. */
export const VOIDAUTH_SESSION_COOKIE = "x-voidauth-session";

export interface Account {
  username: string;
  password: string;
  name: string | null;
  email?: string;
  /** The homelab admin's grants: each app's group is named after its subdomain. */
  groups: string[];
}

/**
 * The instance admin VoidAuth creates on first run, in `auth_admins`, which lets it into every
 * app. It was given only the Encyclopedia.
 */
export const ADMIN: Account = {
  username: "auth_admin",
  password: "violet-quartz-harbour-71",
  name: null,
  groups: ["encyclopedia"],
};
export const ADA: Account = {
  username: "ada",
  password: "lantern-meadow-copper-48",
  name: "Ada Lovelace",
  email: "ada@example.com",
  groups: ["notes-admins", "encyclopedia"],
};
export const DANA: Account = {
  username: "dana",
  password: "quartz-ember-willow-27",
  name: "Dana Scully",
  email: "dana@example.com",
  groups: ["notes"],
};
/** Has a homelab account but no apps. */
export const BOB: Account = {
  username: "bob",
  password: "harbour-violet-thistle-93",
  name: "Bob Ross",
  groups: [],
};
export const PEOPLE = [ADA, DANA, BOB];
export const APPS = [
  { name: "Home", host: `home.${DOMAIN}`, groups: [] },
  { name: "Notes", host: `notes.${DOMAIN}`, groups: ["notes", "notes-admins"] },
  {
    name: "Encyclopedia",
    host: `encyclopedia.${DOMAIN}`,
    groups: ["encyclopedia"],
  },
];

export async function compose(
  env: Record<string, string>,
  ...args: string[]
): Promise<string> {
  const { stdout, stderr } = await run(
    "docker",
    ["compose", "-f", COMPOSE_FILE, ...args],
    {
      env: { ...process.env, ...env },
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  return stdout + stderr;
}

/** The gateway's root certificate, under the stack's data directory. */
export const gatewayCaFile = (dataDir: string) =>
  path.join(dataDir, "caddy/caddy/pki/authorities/local/root.crt");

/** Starts Home, reading apps' manifests through the gateway on this machine. */
export function startHome(dataDir: string): Promise<HomeServer> {
  return startServer({
    homelabUrl: `https://${DOMAIN}:${GATEWAY_PORT}`,
    port: HOME_PORT,
    gateway: {
      url: new URL(`https://127.0.0.1:${GATEWAY_PORT}`),
      caFile: gatewayCaFile(dataDir),
    },
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

/** One browser profile: its own cookies, storage and service workers, like a separate device. */
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

/** Opens Home and signs in on VoidAuth's page; resolves once Home's tiles show. */
export async function signIn(page: Page, account: Account): Promise<void> {
  await page.goto(HOME_URL);
  await onVoidAuthSignIn(page);
  await typePassword(page, account);
  await page.getByRole("list", { name: "Your apps" }).waitFor();
}

/** Waits until the service worker controls the page, so the app can start offline. */
export async function waitUntilOfflineReady(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
}
