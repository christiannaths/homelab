// The homelab's address, given once as HOMELAB_URL (ADR-PLAT-004): everything else the service
// needs to know about where it is comes from it, a port included.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { configFromEnv } from "../src/config.ts";
import { ADA, cookiesOf, startAccounts, type TestAccounts } from "./helpers.ts";

const SECRET = "a-test-secret-that-is-at-least-32-characters";

describe("the setting", () => {
  it("is required, and named when it's missing", () => {
    expect(() => configFromEnv({ ACCOUNTS_SECRET: SECRET })).toThrow(
      /HOMELAB_URL/,
    );
  });

  it.each([
    "home.example",
    "http://home.example",
    "https://home.example/homelab",
    "https://someone@home.example",
  ])("refuses %s, naming the setting", (value) => {
    expect(() =>
      configFromEnv({ HOMELAB_URL: value, ACCOUNTS_SECRET: SECRET }),
    ).toThrow(/HOMELAB_URL/);
  });

  it("gives the parent domain and the accounts site, on the same port", () => {
    const config = configFromEnv({
      HOMELAB_URL: "https://Homelab.localhost:8443/",
      ACCOUNTS_SECRET: SECRET,
    });
    expect(config.domain).toBe("homelab.localhost");
    expect(config.accountsUrl).toBe("https://accounts.homelab.localhost:8443");
  });

  it("leaves the default port out of the accounts site", () => {
    const config = configFromEnv({
      HOMELAB_URL: "https://home.example:443",
      ACCOUNTS_SECRET: SECRET,
    });
    expect(config.domain).toBe("home.example");
    expect(config.accountsUrl).toBe("https://accounts.home.example");
  });
});

describe("on a homelab with a port", () => {
  const ACCOUNTS = "https://accounts.home.test:8443";
  const NOTES = "https://notes.home.test:8443";
  let accounts: TestAccounts;

  beforeAll(async () => {
    accounts = await startAccounts([ADA], {
      homelabUrl: "https://home.test:8443",
    });
  });
  afterAll(() => accounts.close());

  const request = (path: string, init: RequestInit = {}) =>
    Promise.resolve(accounts.app.request(new URL(path, ACCOUNTS).href, init));

  const signIn = (returnTo: string) =>
    request("/sign-in", {
      method: "POST",
      headers: {
        "origin": ACCOUNTS,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        "email": ADA.email,
        "password": ADA.password,
        "return-to": returnTo,
      }),
    });

  it("sends a signed-out browser to the accounts site on that port", async () => {
    const response = await request("/api/authz/forward-auth", {
      headers: {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "notes.home.test:8443",
        "x-forwarded-uri": "/page",
      },
    });
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.origin).toBe(ACCOUNTS);
    expect(location.searchParams.get("return-to")).toBe(`${NOTES}/page`);
  });

  it("signs in on the parent domain and returns to the app on that port", async () => {
    const response = await signIn(`${NOTES}/page`);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${NOTES}/page`);
    const cookie = response.headers
      .getSetCookie()
      .find((c) => c.startsWith("__Secure-homelab.session_token="));
    expect(cookie).toMatch(/Domain=\.?home\.test;/i);
  });

  it("won't return to an app on another port", async () => {
    const response = await signIn("https://notes.home.test/page");
    expect(response.headers.get("location")).toBe(`${ACCOUNTS}/`);
  });

  it("links each app at its address on that port", async () => {
    const cookie = cookiesOf(await signIn(`${ACCOUNTS}/`));
    const html = await (await request("/", { headers: { cookie } })).text();
    expect(html).toContain(`href="${NOTES}/"`);
    expect(html).toContain(`src="${NOTES}/icons/icon-192.png"`);
  });

  it("answers the App switcher on an app's page on that port, and no other", async () => {
    const cookie = cookiesOf(await signIn(`${ACCOUNTS}/`));
    const fromPage = (origin: string) =>
      request("/session", {
        method: "POST",
        headers: { cookie, origin, "sec-fetch-site": "same-site" },
      });
    const ours = await fromPage(NOTES);
    expect(ours.status).toBe(204);
    expect(ours.headers.get("access-control-allow-origin")).toBe(NOTES);
    expect((await fromPage("https://notes.home.test")).status).toBe(403);
  });
});
