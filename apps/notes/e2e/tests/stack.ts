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
/** The accounts service's session cookie, on the parent domain. */
export const SESSION_COOKIE = "__Secure-homelab.session_token";

/**
 * A test person, as the accounts service's loader takes them
 * (platform/accounts/src/test-people.ts).
 */
export interface Account {
  email: string;
  password: string;
  name: string;
  /** App access to Notes: `member`, or `admin` for an owner. */
  apps: { notes?: "member" | "admin" };
}

export const ADA: Account = {
  email: "ada@example.com",
  password: "lantern-meadow-copper-48",
  name: "Ada Lovelace",
  apps: { notes: "admin" },
};
export const DANA: Account = {
  email: "dana@example.com",
  password: "quartz-ember-willow-27",
  name: "Dana Scully",
  apps: { notes: "member" },
};
/** Has a homelab account but was not given Notes. */
export const BOB: Account = {
  email: "bob@example.com",
  password: "harbour-violet-thistle-93",
  name: "Bob Ross",
  apps: {},
};
export const EVE: Account = {
  email: "eve@example.com",
  password: "ember-thistle-lantern-62",
  name: "Eve Moneypenny",
  apps: { notes: "member" },
};
export const ACCOUNTS = [ADA, DANA, BOB, EVE];

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

/**
 * Makes the people in the accounts service, or brings them to exactly what is given, with its
 * loader for test people. A change in App access takes effect on the person's next request.
 * Resolves to each person's account id, by email.
 */
export function loadPeople(
  composeEnv: Record<string, string>,
  people: Account[],
): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "docker",
      [
        "compose",
        "-f",
        COMPOSE_FILE,
        "exec",
        "-T",
        "accounts",
        "node",
        "--no-experimental-webstorage",
        "platform/accounts/src/load-test-people.ts",
      ],
      { env: { ...process.env, ...composeEnv } },
      (error, stdout, stderr) => {
        if (error) reject(new Error(`Loading people failed: ${stderr}`));
        // The ids are the last line, after anything Better Auth logs.
        else resolve(idsFrom(stdout.trim().split("\n").at(-1) ?? ""));
      },
    );
    child.stdin?.end(JSON.stringify(people));
  });
}

function idsFrom(line: string): Record<string, string> {
  const ids: unknown = JSON.parse(line);
  if (typeof ids !== "object" || ids === null)
    throw new Error(`No account ids in ${line}`);
  return Object.fromEntries(
    Object.entries(ids).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

export function startNotes(): Promise<NotesServer> {
  return startServer({
    dataDir: mkdtempSync(path.join(tmpdir(), "notes-e2e-")),
    port: NOTES_PORT,
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

/** Resolves once the page has arrived on the accounts site's sign-in page. */
export function onSignInPage(page: Page): Promise<void> {
  return page.waitForURL(
    (url) => url.origin === ACCOUNTS_URL && url.pathname === "/sign-in",
  );
}

/** Types an email and password on the sign-in page, which the page must already be on. */
export async function typePassword(
  page: Page,
  account: Pick<Account, "email" | "password">,
): Promise<void> {
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/** Opens Notes and signs in on the sign-in page; resolves once the protected page shows. */
export async function signIn(page: Page, account: Account): Promise<void> {
  await page.goto(NOTES_URL);
  await onSignInPage(page);
  await typePassword(page, account);
  await page.getByText("Signed in as").waitFor();
}

/** Waits until the service worker controls the page, so the app can start offline. */
export async function waitUntilOfflineReady(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
}
