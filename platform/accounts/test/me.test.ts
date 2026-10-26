// Who is signed in and which apps they have (ADR-PLAT-004), which the App switcher in every app and
// Home's tiles ask the accounts site on every load, from their own pages.
import { describe, expect, it, vi } from "vitest";
import {
  ACCOUNTS,
  ADA,
  BOB,
  DOMAIN,
  readManifest,
  request,
  signIn,
  startAccounts,
  type TestAccounts,
} from "./helpers.ts";

const NOTES = `https://notes.${DOMAIN}`;

/** Asks as the App switcher's fetch from Notes' page does, unless `headers` say otherwise. */
function me(
  accounts: TestAccounts,
  cookie: string,
  headers: Record<string, string> = {
    "origin": NOTES,
    "sec-fetch-site": "same-site",
    "sec-fetch-mode": "cors",
  },
): Promise<Response> {
  return request(accounts, "/api/me", { headers: { cookie, ...headers } });
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The ids of the apps in an answer. */
async function appIdsIn(response: Response): Promise<unknown[]> {
  const body: unknown = await response.json();
  const apps = isRecord(body) && Array.isArray(body.apps) ? body.apps : [];
  return apps.map((app) => (isRecord(app) ? app.id : undefined));
}

const HOME_APP = {
  id: "home",
  url: `https://home.${DOMAIN}/`,
  name: "Home",
  icon: `https://home.${DOMAIN}/icons/icon-192.png`,
  opensOffline: true,
};

describe("a signed-in person", () => {
  it("gets their account id, name, email, account and sign-out addresses, and their apps by name", async () => {
    const accounts = await startAccounts();
    const response = await me(accounts, await signIn(accounts, ADA));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      person: {
        id: accounts.ids[ADA.email],
        name: ADA.name,
        email: ADA.email,
      },
      accountUrl: `${ACCOUNTS}/`,
      signOutUrl: `${ACCOUNTS}/sign-out`,
      apps: [
        {
          id: "encyclopedia",
          url: `https://encyclopedia.${DOMAIN}/`,
          name: "Encyclopedia",
          icon: `https://encyclopedia.${DOMAIN}/icons/icon-512.png`,
          opensOffline: false,
        },
        HOME_APP,
        {
          id: "notes",
          url: `${NOTES}/`,
          name: "Notes",
          icon: `${NOTES}/icons/icon-192.png`,
          opensOffline: false,
        },
      ],
    });
  });

  it("always has Home, even with no App access", async () => {
    const accounts = await startAccounts();
    expect(
      await appIdsIn(await me(accounts, await signIn(accounts, BOB))),
    ).toEqual(["home"]);
  });

  it("sees App access given or taken away on the next answer", async () => {
    const accounts = await startAccounts();
    const cookie = await signIn(accounts, BOB);
    const bob = accounts.ids[BOB.email] ?? "";
    accounts.appAccess.set(bob, { notes: "member" });
    expect(await appIdsIn(await me(accounts, cookie))).toEqual([
      "home",
      "notes",
    ]);
    accounts.appAccess.set(bob, { encyclopedia: "admin" });
    expect(await appIdsIn(await me(accounts, cookie))).toEqual([
      "encyclopedia",
      "home",
    ]);
  });
});

describe("an app whose manifest can't be read", () => {
  const VAULT = {
    ...BOB,
    apps: { vault: "member" as const, notes: "member" as const },
  };

  it("is listed under its subdomain, with no icon and not opening offline, and warned about once", async () => {
    const warn = vi.fn<(message: string) => void>();
    const accounts = await startAccounts(
      [VAULT],
      { apps: ["notes", "encyclopedia", "vault"] },
      { warn },
    );
    const cookie = await signIn(accounts, VAULT);
    const body: unknown = await (await me(accounts, cookie)).json();
    expect(body).toMatchObject({
      apps: [
        { id: "home" },
        { id: "notes" },
        {
          id: "vault",
          url: `https://vault.${DOMAIN}/`,
          name: "Vault",
          icon: null,
          opensOffline: false,
        },
      ],
    });
    await me(accounts, cookie);
    await request(accounts, "/", { headers: { cookie } });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toContain("vault");
  });

  it("is warned about again when it goes missing after being read", async () => {
    let vaultUp = false;
    const warn = vi.fn<(message: string) => void>();
    let now = 0;
    const accounts = await startAccounts(
      [VAULT],
      { apps: ["notes", "encyclopedia", "vault"] },
      {
        warn,
        now: () => now,
        readManifest: async (url) =>
          url.hostname.startsWith("vault.")
            ? vaultUp
              ? { name: "Vault", icons: [] }
              : undefined
            : readManifest(url),
      },
    );
    const cookie = await signIn(accounts, VAULT);
    await me(accounts, cookie);
    vaultUp = true;
    now += 24 * 60 * 60_000;
    await me(accounts, cookie);
    vaultUp = false;
    now += 2 * 24 * 60 * 60_000;
    await me(accounts, cookie);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

describe("an install without Home", () => {
  it("lists the person's apps without it, and warns about nothing", async () => {
    const warn = vi.fn<(message: string) => void>();
    const accounts = await startAccounts(
      [ADA],
      {},
      {
        warn,
        readManifest: async (url) =>
          url.hostname.startsWith("home.") ? undefined : readManifest(url),
      },
    );
    const response = await me(accounts, await signIn(accounts, ADA));
    expect(await appIdsIn(response)).toEqual(["encyclopedia", "notes"]);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("a signed-out browser", () => {
  it("gets an answer saying so, which the app's page can read", async () => {
    const accounts = await startAccounts();
    const response = await me(accounts, "");
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "signed_out" });
    expect(response.headers.get("access-control-allow-origin")).toBe(NOTES);
    expect(response.headers.get("access-control-allow-credentials")).toBe(
      "true",
    );
  });
});

describe("who may read the answer", () => {
  it("is any https page under the parent domain, with credentials", async () => {
    const accounts = await startAccounts();
    const response = await me(accounts, await signIn(accounts, ADA));
    expect(response.headers.get("access-control-allow-origin")).toBe(NOTES);
    expect(response.headers.get("access-control-allow-credentials")).toBe(
      "true",
    );
    expect(response.headers.get("vary")).toMatch(/origin/i);
  });

  it("includes the accounts site's own pages, which send no Origin", async () => {
    const accounts = await startAccounts();
    const response = await me(accounts, await signIn(accounts, ADA), {
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "cors",
    });
    expect(response.status).toBe(200);
  });

  it("is refused to another site and to origins that aren't the homelab's", async () => {
    const accounts = await startAccounts();
    const cookie = await signIn(accounts, ADA);
    const notTheHomelab: Record<string, string>[] = [
      { "origin": "https://evil.example", "sec-fetch-site": "cross-site" },
      { "sec-fetch-site": "cross-site" },
      { origin: "https://evil.example" },
      { origin: `https://${DOMAIN}.evil.example` },
      { origin: `https://evil${DOMAIN}` },
      { origin: `http://notes.${DOMAIN}` },
      { origin: "null" },
    ];
    for (const headers of notTheHomelab) {
      const response = await me(accounts, cookie, headers);
      expect(response.status, JSON.stringify(headers)).toBe(403);
      expect(response.headers.get("access-control-allow-origin")).toBe(null);
    }
  });
});
