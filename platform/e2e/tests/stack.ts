// The homelab around Home (compose.yaml) and the people the tests sign in as. A browser reaches
// everything through the gateway on GATEWAY_PORT, as a browser on the home network would.
import { execFile } from "node:child_process";
import { connect } from "node:tls";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { startServer, type HomeServer } from "@homelab/home-server";
import { chromium, type Browser, type Page } from "playwright";

const run = promisify(execFile);
const COMPOSE_FILE = fileURLToPath(new URL("../compose.yaml", import.meta.url));
/** The client's production build: the service worker exists only there. */
const CLIENT_DIR = fileURLToPath(
  new URL("../../home/web/dist", import.meta.url),
);

/** The homelab's address, as an installer gives it. The rest of the stack's addresses follow. */
export const HOMELAB_URL = "https://home.test:8473";
const HOMELAB = new URL(HOMELAB_URL);
export const GATEWAY_PORT = Number(HOMELAB.port);
export const DOMAIN = HOMELAB.hostname;
/** Where the Home server listens on this machine; only the gateway is meant to reach it. */
export const HOME_PORT = 4130;
const appUrl = (app: string) => `https://${app}.${HOMELAB.host}`;
export const ACCOUNTS_URL = appUrl("accounts");
export const HOME_URL = appUrl("home");
export const NOTES_URL = appUrl("notes");
export const ENCYCLOPEDIA_URL = appUrl("encyclopedia");
export const VAULT_URL = appUrl("vault");
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
  homelabAdmin?: boolean;
  /** App access, by app subdomain. */
  apps: Record<string, "member" | "admin">;
}

/** A homelab admin, who was given only the Encyclopedia. */
export const ADMIN: Account = {
  email: "admin@example.com",
  password: "violet-quartz-harbour-71",
  name: "Homelab Admin",
  homelabAdmin: true,
  apps: { encyclopedia: "member" },
};
export const ADA: Account = {
  email: "ada@example.com",
  password: "lantern-meadow-copper-48",
  name: "Ada Lovelace",
  apps: { notes: "admin", encyclopedia: "member" },
};
export const DANA: Account = {
  email: "dana@example.com",
  password: "quartz-ember-willow-27",
  name: "Dana Scully",
  apps: { notes: "member" },
};
/** Has a homelab account but no apps. */
export const BOB: Account = {
  email: "bob@example.com",
  password: "harbour-violet-thistle-93",
  name: "Bob Ross",
  apps: {},
};
/** Has an app that doesn't open offline, the Vault stand-in in gateway.caddyfile. */
export const GRACE: Account = {
  email: "grace@example.com",
  password: "copper-thistle-lantern-65",
  name: "Grace Hopper",
  apps: { notes: "member", encyclopedia: "member", vault: "member" },
};
/** Has their App access changed by the tests, as an admin granting and removing apps. */
export const HEDY: Account = {
  email: "hedy@example.com",
  password: "willow-harbour-ember-52",
  name: "Hedy Lamarr",
  apps: { notes: "member" },
};
/** Has their App access, homelab admin switch and sessions changed on the People page. */
export const KATHERINE: Account = {
  email: "katherine@example.com",
  password: "orbit-trajectory-ember-62",
  name: "Katherine Johnson",
  apps: { notes: "member" },
};
/** Has their account removed on the People page. */
export const MARGARET: Account = {
  email: "margaret@example.com",
  password: "apollo-guidance-lantern-69",
  name: "Margaret Hamilton",
  apps: { notes: "member" },
};
export const PEOPLE = [ADMIN, ADA, DANA, BOB, GRACE, HEDY, KATHERINE, MARGARET];

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

/** Starts Home, which the gateway reaches on this machine. */
export function startHome(): Promise<HomeServer> {
  return startServer({ port: HOME_PORT, clientDir: CLIENT_DIR });
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

/** Opens Home and signs in on the sign-in page; resolves once Home's tiles show. */
export async function signIn(page: Page, account: Account): Promise<void> {
  await page.goto(HOME_URL);
  await onSignInPage(page);
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

/** The browser's complaints about a page's security policy, from when this is called. */
export function securityPolicyErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy/i.test(message.text()))
      errors.push(message.text());
  });
  return errors;
}
