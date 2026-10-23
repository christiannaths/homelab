// The stack and the people the tests sign in as. Everything a test does goes through the gateway
// on GATEWAY_PORT, the way a browser on the home network would.
import { createHmac } from "node:crypto";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

const run = promisify(execFile);
const COMPOSE_FILE = fileURLToPath(new URL("../compose.yaml", import.meta.url));

export const GATEWAY_PORT = 8473;
export const ACCOUNTS_PORT = 4130;
export const DOMAIN = "home.test";
export const ACCOUNTS = `https://accounts.${DOMAIN}:${GATEWAY_PORT}`;
export const NOTES = `https://notes.${DOMAIN}:${GATEWAY_PORT}`;
export const ENCYCLOPEDIA = `https://encyclopedia.${DOMAIN}:${GATEWAY_PORT}`;
/** The sign-in rate limit the tests run with: this many attempts per window per address. */
export const SIGN_IN_RATE = { window: 10, max: 15 };

export interface Account {
  email: string;
  password: string;
  name: string;
  groups: string[];
}

export const ADMIN: Account = {
  email: "admin@example.com",
  password: "violet-quartz-harbour-71",
  name: "Homelab Admin",
  groups: ["auth_admins"],
};
// The homelab admin's per-app grants. `<app>-admins` lets a person in and makes them the app's
// admin; `<app>` lets them in as a member.
export const ADA: Account = {
  email: "ada@example.com",
  password: "lantern-meadow-copper-48",
  name: "Ada Lovelace",
  groups: ["notes-admins", "encyclopedia"],
};
export const BOB: Account = {
  email: "bob@example.com",
  password: "harbour-violet-thistle-93",
  name: "Bob Ross",
  groups: ["encyclopedia"],
};
/** Has both apps until the revoking test takes Encyclopedia away. */
export const DANA: Account = {
  email: "dana@example.com",
  password: "quartz-ember-willow-27",
  name: "Dana Scully",
  groups: ["notes", "encyclopedia"],
};
export const PEOPLE = [ADA, BOB, DANA];

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

/** A browser profile on one device: its own cookies and storage. */
export function newDevice(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ ignoreHTTPSErrors: true });
}

/** Types email and password on our sign-in page, where the gateway sent the browser. */
export async function signIn(
  page: Page,
  account: Pick<Account, "email" | "password">,
) {
  await page.waitForURL(`${ACCOUNTS}/sign-in**`);
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/** What a stand-in app was told about the person, from its page. */
export async function seenByApp(page: Page): Promise<Record<string, string>> {
  const text = await page.locator("body").innerText();
  return Object.fromEntries(
    text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const at = line.indexOf(":");
        return [line.slice(0, at), line.slice(at + 1).trim()];
      }),
  );
}

/** A call to the accounts service's admin endpoints, from the admin's page on it. */
async function adminApi(
  page: Page,
  method: "POST" | "PUT",
  path: string,
  body: unknown,
): Promise<unknown> {
  if (!page.url().startsWith(ACCOUNTS)) await page.goto(`${ACCOUNTS}/`);
  const { status, text } = await page.evaluate(
    async (call) => {
      const response = await fetch(call.path, {
        method: call.method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(call.body),
      });
      return { status: response.status, text: await response.text() };
    },
    { method, path, body },
  );
  expect(status, `${method} ${path}: ${text}`).toBeLessThan(300);
  const json: unknown = JSON.parse(text);
  return json;
}

/** Makes an invite link, as the admin. */
export async function createInvite(
  admin: Page,
  invite: { groups: string[]; email?: string },
): Promise<string> {
  const json = await adminApi(admin, "POST", "/admin/invites", invite);
  const url =
    typeof json === "object" && json !== null && "url" in json
      ? json.url
      : undefined;
  if (typeof url !== "string")
    throw new Error(`No invite link in ${JSON.stringify(json)}`);
  return url;
}

/** Replaces the apps a person may open, as the admin. */
export async function setGroups(
  admin: Page,
  email: string,
  groups: string[],
): Promise<void> {
  await adminApi(admin, "PUT", `/admin/people/${email}/groups`, { groups });
}

/** Fills in an invite link's form, which signs the new person in. */
export async function acceptInvite(page: Page, link: string, account: Account) {
  await page.goto(link);
  await page.getByLabel("Name").fill(account.name);
  const email = page.getByLabel("Email");
  if (await email.isEditable()) await email.fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(`${ACCOUNTS}/`);
}

/** The current code for a TOTP secret (RFC 6238: SHA-1, 6 digits, 30 seconds), as an authenticator app shows it. */
export function totp(otpauthUri: string, now = Date.now()): string {
  const secret = new URL(otpauthUri).searchParams.get("secret") ?? "";
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of secret.replace(/=+$/, "").toUpperCase())
    bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  const key = Buffer.from(
    bits.match(/.{8}/g)!.map((byte) => parseInt(byte, 2)),
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const mac = createHmac("sha1", key).update(counter).digest();
  const offset = (mac.at(-1) ?? 0) & 0xf;
  const code = (mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, "0");
}
