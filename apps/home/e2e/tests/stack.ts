// The homelab around Home (compose.yaml) and the people the tests sign in as. A browser reaches
// everything through the gateway on GATEWAY_PORT, as a browser on the home network would.
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { connect } from "node:tls";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { startServer, type HomeServer } from "@homelab/home-server";
import { VoidAuthClient } from "@homelab/voidauth-fixtures";
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
export const VAULT_URL = appUrl("vault");
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
/** Has an app that doesn't open offline, the Vault stand-in in gateway.caddyfile. */
export const GRACE: Account = {
  username: "grace",
  password: "copper-thistle-lantern-65",
  name: "Grace Hopper",
  email: "grace@example.com",
  groups: ["notes", "encyclopedia", "vault"],
};
/** Has their groups changed by the tests, as an admin granting and removing apps. */
export const HEDY: Account = {
  username: "hedy",
  password: "willow-harbour-ember-52",
  name: "Hedy Lamarr",
  groups: ["notes"],
};
export const PEOPLE = [ADA, DANA, BOB, GRACE, HEDY];
export const APPS = [
  { name: "Home", host: `home.${DOMAIN}`, groups: [] },
  { name: "Notes", host: `notes.${DOMAIN}`, groups: ["notes", "notes-admins"] },
  {
    name: "Encyclopedia",
    host: `encyclopedia.${DOMAIN}`,
    groups: ["encyclopedia"],
  },
  { name: "Vault", host: `vault.${DOMAIN}`, groups: ["vault"] },
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

/** VoidAuth's API signed in as the homelab admin, for granting and removing apps. */
export async function signInAsAdmin(dataDir: string): Promise<VoidAuthClient> {
  const admin = new VoidAuthClient({
    url: ACCOUNTS_URL,
    ca: await readFile(gatewayCaFile(dataDir), "utf8"),
  });
  if (!(await admin.signIn(ADMIN)))
    throw new Error(`Can't sign in to VoidAuth as ${ADMIN.username}`);
  return admin;
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

/**
 * Takes the device off the network: the browser says it is offline, and the gateway is stopped,
 * since Playwright's offline mode still lets service workers through to the network.
 */
export async function goOffline(
  page: Page,
  composeEnv: Record<string, string>,
): Promise<void> {
  await page.context().setOffline(true);
  await compose(composeEnv, "stop", "gateway");
}

/** Puts the device back on the network, once the gateway answers again. */
export async function goOnline(
  page: Page,
  composeEnv: Record<string, string>,
): Promise<void> {
  await compose(composeEnv, "start", "gateway");
  for (let i = 0; !(await gatewayAnswers()); i++) {
    if (i === 60) throw new Error("The gateway didn't come back");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  await page.context().setOffline(false);
}

// Docker takes connections on the port as soon as the container starts; a TLS handshake waits for
// Caddy itself. Its certificate is checked by the browser, not here.
const gatewayAnswers = () =>
  new Promise<boolean>((resolve) => {
    const socket = connect({
      host: "127.0.0.1",
      port: GATEWAY_PORT,
      servername: `accounts.${DOMAIN}`,
      rejectUnauthorized: false,
    })
      .once("secureConnect", () => {
        socket.destroy();
        resolve(true);
      })
      .once("error", () => resolve(false));
  });

/** Answers Yes on VoidAuth's "sign out?" page, which the browser must be on or on its way to. */
export async function confirmSignOut(page: Page): Promise<void> {
  await page.waitForURL(
    (url) => url.origin === ACCOUNTS_URL && url.pathname.startsWith("/logout"),
  );
  await page.getByRole("button", { name: "Yes", exact: true }).click();
}

/** The App switcher's tab at the top of the page, whose menu it opens. */
export const tab = (page: Page) =>
  page.getByRole("button", { name: /: apps and sign out$/ });

/** The initials on the person's icon at the top of the App switcher's menu, opening it first. */
export async function initialsInMenu(page: Page): Promise<string | null> {
  const menu = page.getByRole("menu", { name: "Apps and sign out" });
  if (!(await menu.isVisible())) await tab(page).click();
  return page.evaluate(
    () =>
      document
        .querySelector("homelab-switcher")
        ?.shadowRoot?.querySelector(".avatar")?.textContent ?? null,
  );
}

/** The names of the items in the App switcher's menu, opening it first. */
export async function menuItems(page: Page): Promise<string[]> {
  const menu = page.getByRole("menu", { name: "Apps and sign out" });
  if (!(await menu.isVisible())) await tab(page).click();
  return menu
    .getByRole("menuitem")
    .evaluateAll((items) =>
      items.map((item) => item.textContent?.trim() ?? ""),
    );
}
