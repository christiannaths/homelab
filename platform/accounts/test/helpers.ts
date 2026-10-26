// The accounts service in this process, with no gateway or browser: requests go straight to its
// Hono app, with the headers the gateway would add.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ReadManifest } from "@homelab/app-manifests";
import { createAccounts, type Accounts } from "../src/accounts.ts";
import type { Config } from "../src/config.ts";
import { loadTestPeople, type TestPerson } from "../src/test-people.ts";

export const DOMAIN = "home.test";
export const ACCOUNTS = `https://accounts.${DOMAIN}`;

export const ADA: TestPerson = {
  email: "ada@example.com",
  password: "lantern-meadow-copper-48",
  name: "Ada Lovelace",
  apps: { notes: "admin", encyclopedia: "member" },
};
export const BOB: TestPerson = {
  email: "bob@example.com",
  password: "harbour-violet-thistle-93",
  name: "Bob Ross",
};
export const ADMIN: TestPerson = {
  email: "admin@example.com",
  password: "violet-quartz-harbour-71",
  name: "Homelab Admin",
  homelabAdmin: true,
};

/** The installed apps' manifests, as the gateway would serve them, by hostname. */
const MANIFESTS: Record<string, unknown> = {
  [`notes.${DOMAIN}`]: {
    name: "Notes",
    icons: [{ src: "icons/icon-192.png", sizes: "192x192" }],
  },
  [`encyclopedia.${DOMAIN}`]: {
    name: "Encyclopedia",
    icons: [{ src: "/icons/icon-512.png", sizes: "512x512" }],
  },
};

const readManifest: ReadManifest = async (url) =>
  url.pathname === "/manifest.webmanifest" ? MANIFESTS[url.host] : undefined;

export interface TestAccounts extends Accounts {
  /** Each loaded person's account id, by email. */
  ids: Record<string, string>;
}

/** A fresh service with the given people, and settings overridden by `config`. */
export async function startAccounts(
  people: TestPerson[] = [ADA, BOB, ADMIN],
  config: Partial<Config> = {},
): Promise<TestAccounts> {
  const accounts = await createAccounts(
    {
      domain: DOMAIN,
      accountsUrl: ACCOUNTS,
      secret: "a-test-secret-that-is-at-least-32-characters",
      dataDir: mkdtempSync(path.join(tmpdir(), "accounts-")),
      port: 0,
      apps: ["notes", "encyclopedia"],
      gateway: {},
      signInRateLimit: { window: 60, max: 100 },
      ...config,
    },
    { readManifest },
  );
  const ids = await loadTestPeople(accounts, people);
  return Object.assign(accounts, { ids });
}

export function request(
  accounts: Accounts,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  return Promise.resolve(
    accounts.app.request(new URL(url, ACCOUNTS).href, init),
  );
}

/** The cookies a response sets, as a browser would send them back. */
export function cookiesOf(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

/** Submits the sign-in page's form, as a browser at `address` would through the gateway. */
export function submitSignIn(
  accounts: Accounts,
  fields: { email: string; password: string; returnTo?: string },
  address = "192.0.2.1",
): Promise<Response> {
  const form = new URLSearchParams({
    email: fields.email,
    password: fields.password,
  });
  if (fields.returnTo) form.set("return-to", fields.returnTo);
  return request(accounts, "/sign-in", {
    method: "POST",
    headers: {
      "origin": ACCOUNTS,
      "content-type": "application/x-www-form-urlencoded",
      "x-forwarded-for": address,
    },
    body: form,
  });
}

/** Signs in with the person's email and password, and returns the session cookie. */
export async function signIn(
  accounts: Accounts,
  person: Pick<TestPerson, "email" | "password">,
): Promise<string> {
  const response = await submitSignIn(accounts, person);
  if (response.status !== 303)
    throw new Error(`Sign-in failed with ${response.status}`);
  return cookiesOf(response);
}

/** The gateway's question about a request to `host`, with the browser's cookies. */
export function askGateway(
  accounts: Accounts,
  cookie: string,
  host = `notes.${DOMAIN}`,
  uri = "/",
): Promise<Response> {
  return request(accounts, "/api/authz/forward-auth", {
    headers: {
      cookie,
      "x-forwarded-proto": "https",
      "x-forwarded-host": host,
      "x-forwarded-uri": uri,
      "x-forwarded-method": "GET",
    },
  });
}

/** Posts a form as the browser does from one of the accounts site's own pages. */
export function submitForm(
  accounts: Accounts,
  to: string,
  cookie: string,
  fields: Record<string, string> | [string, string][] = {},
  headers: Record<string, string> = {},
): Promise<Response> {
  return request(accounts, to, {
    method: "POST",
    headers: {
      cookie,
      "origin": ACCOUNTS,
      "sec-fetch-site": "same-origin",
      "content-type": "application/x-www-form-urlencoded",
      ...headers,
    },
    body: new URLSearchParams(fields),
  });
}
