// The compose stack and the people the tests sign in as. Everything a test does goes through the
// gateway on GATEWAY_PORT, the way a browser on the home network would.
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { Browser, BrowserContext, Page } from "@playwright/test";

const run = promisify(execFile);
const COMPOSE_FILE = fileURLToPath(
  new URL("../../compose.yaml", import.meta.url),
);

export const GATEWAY_PORT = 8453;
export const DOMAIN = "home.test";
export const AUTH = `https://auth.${DOMAIN}:${GATEWAY_PORT}`;
export const NOTES = `https://notes.${DOMAIN}:${GATEWAY_PORT}`;
export const ENCYCLOPEDIA = `https://encyclopedia.${DOMAIN}:${GATEWAY_PORT}`;

export const ADMIN = {
  username: "auth_admin",
  password: "violet-quartz-harbour-71",
};

export interface Account {
  username: string;
  password: string;
  name: string;
  groups: string[];
}

// The homelab admin's per-app grants. `<app>-admins` lets a person in and makes them the app's
// admin; `<app>` lets them in as a member.
export const ADA: Account = {
  username: "ada",
  password: "lantern-meadow-copper-48",
  name: "Ada Lovelace",
  groups: ["notes", "notes-admins", "encyclopedia"],
};
export const BOB: Account = {
  username: "bob",
  password: "harbour-violet-thistle-93",
  name: "Bob Ross",
  groups: ["encyclopedia"],
};
/** Has both apps until the revoking test takes Encyclopedia away. */
export const DANA: Account = {
  username: "dana",
  password: "quartz-ember-willow-27",
  name: "Dana Scully",
  groups: ["notes", "encyclopedia"],
};
export const ACCOUNTS = [ADA, BOB, DANA];

export const APP_DOMAINS = [
  { domain: `notes.${DOMAIN}/*`, groups: ["notes", "notes-admins"] },
  { domain: `encyclopedia.${DOMAIN}/*`, groups: ["encyclopedia"] },
];

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

/** A browser profile on one device: its own cookies, service workers and storage. */
export function newDevice(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ ignoreHTTPSErrors: true });
}

/**
 * Types the password on VoidAuth's sign-in page, where the gateway sent the browser, and turns
 * down the passkey VoidAuth offers after a password sign-in.
 */
export async function signIn(
  page: Page,
  account: Pick<Account, "username" | "password">,
) {
  await page.waitForURL(`${AUTH}/login**`);
  await page.locator('input[formcontrolname="email"]').fill(account.username);
  await page
    .locator('input[formcontrolname="password"]')
    .fill(account.password);
  await page.locator('button[type="submit"]').click();
  const skip = page.getByRole("button", { name: "Skip" });
  const left = page.waitForURL((url) => !url.pathname.startsWith("/login"));
  if (
    (await Promise.race([
      left.then(() => "left"),
      skip.waitFor().then(() => "asked"),
    ])) === "asked"
  )
    await skip.click();
  await left;
}

/**
 * A same-origin call to VoidAuth's JSON API from a page on VoidAuth, as its own web UI makes.
 * Returns the parsed body; fails with `what` on any status from 300 up.
 */
export async function voidauthApi(
  page: Page,
  what: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  if (!page.url().startsWith(AUTH)) await page.goto(`${AUTH}/`);
  const { status, text } = await page.evaluate(
    async ([verb, url, payload]) => {
      const init: RequestInit = {
        method: verb,
        headers: { "content-type": "application/json" },
      };
      if (payload !== undefined) init.body = JSON.stringify(payload);
      const response = await fetch(`/api${url}`, init);
      return { status: response.status, text: await response.text() };
    },
    [method, path, body] as const,
  );
  if (status >= 300) throw new Error(`${what} failed: ${status} ${text}`);
  const parsed: unknown = text ? JSON.parse(text) : null;
  return parsed;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A string field of a JSON body, failing the test when the body has another shape. */
export function stringField(body: unknown, key: string): string {
  const value = isRecord(body) ? body[key] : undefined;
  if (typeof value !== "string")
    throw new Error(`No string ${key} in ${JSON.stringify(body)}`);
  return value;
}

/** The objects of a JSON array body, failing the test when it is something else. */
export function records(body: unknown): Record<string, unknown>[] {
  if (!Array.isArray(body) || !body.every(isRecord))
    throw new Error(`Not a list of objects: ${JSON.stringify(body)}`);
  return body;
}
