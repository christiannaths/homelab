// Signing out (ADR-PLAT-004): a POST from the App switcher on an app's page, or from a form on the
// accounts site. It ends this device's session only, and no other site can send it.
import { beforeAll, describe, expect, it } from "vitest";
import {
  ACCOUNTS,
  ADA,
  askGateway,
  DOMAIN,
  request,
  signIn,
  startAccounts,
  type TestAccounts,
} from "./helpers.ts";

let accounts: TestAccounts;

beforeAll(async () => {
  accounts = await startAccounts();
});

const NOTES = `https://notes.${DOMAIN}`;

/** Signs out as the App switcher's fetch from Notes' page does, unless `headers` say otherwise. */
function signOut(
  cookie: string,
  headers: Record<string, string> = {
    "origin": NOTES,
    "sec-fetch-site": "same-site",
    "sec-fetch-mode": "cors",
  },
): Promise<Response> {
  return request(accounts, "/sign-out", {
    method: "POST",
    headers: { cookie, ...headers },
  });
}

const sessionCookie = (response: Response) =>
  response.headers
    .getSetCookie()
    .find((c) => c.startsWith("__Secure-homelab.session_token="));

describe("signing out from an app's App switcher", () => {
  it("ends this device's session only", async () => {
    const phone = await signIn(accounts, ADA);
    const tablet = await signIn(accounts, ADA);
    const response = await signOut(tablet);
    expect(response.status).toBe(204);
    expect(sessionCookie(response)).toMatch(/Max-Age=0/i);
    expect(sessionCookie(response)).toMatch(/Domain=\.?home\.test/i);
    expect((await askGateway(accounts, tablet)).status).toBe(302);
    expect((await askGateway(accounts, phone)).status).toBe(200);
  });

  it("lets the app's page read the answer, so the switcher knows it is done", async () => {
    const response = await signOut(await signIn(accounts, ADA));
    expect(response.headers.get("access-control-allow-origin")).toBe(NOTES);
    expect(response.headers.get("access-control-allow-credentials")).toBe(
      "true",
    );
    expect(response.headers.get("vary")).toMatch(/origin/i);
  });

  it("works from any homelab app's address, port included", async () => {
    const cookie = await signIn(accounts, ADA);
    const origin = `https://encyclopedia.${DOMAIN}:8443`;
    const response = await signOut(cookie, {
      "origin": origin,
      "sec-fetch-site": "same-site",
      "sec-fetch-mode": "cors",
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    expect((await askGateway(accounts, cookie)).status).toBe(302);
  });

  it("answers the same for a browser already signed out", async () => {
    const response = await signOut("");
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(NOTES);
  });
});

describe("signing out from a form on the accounts site", () => {
  it("shows the sign-in page", async () => {
    const cookie = await signIn(accounts, ADA);
    const response = await signOut(cookie, {
      "origin": ACCOUNTS,
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "navigate",
      "content-type": "application/x-www-form-urlencoded",
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/sign-in");
    expect(sessionCookie(response)).toMatch(/Max-Age=0/i);
    expect((await askGateway(accounts, cookie)).status).toBe(302);
  });
});

describe("what doesn't sign anyone out", () => {
  it("a GET, such as a link or an image on another site", async () => {
    const cookie = await signIn(accounts, ADA);
    const response = await request(accounts, "/sign-out", {
      headers: { cookie },
    });
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(response.headers.getSetCookie()).toEqual([]);
    expect((await askGateway(accounts, cookie)).status).toBe(200);
  });

  it.each<[string, Record<string, string>]>([
    [
      "another site's page",
      { "origin": "https://elsewhere.test", "sec-fetch-site": "cross-site" },
    ],
    [
      "another site, in a browser without fetch metadata",
      { origin: "https://elsewhere.test" },
    ],
    [
      "a site whose name only ends like the domain",
      { "origin": `https://not${DOMAIN}`, "sec-fetch-site": "cross-site" },
    ],
    ["a homelab address over http", { origin: `http://notes.${DOMAIN}` }],
    [
      "a cross-site request, whatever its Origin says",
      { "origin": NOTES, "sec-fetch-site": "cross-site" },
    ],
    ["a request with no Origin", {}],
    ["a sandboxed page", { "origin": "null", "sec-fetch-site": "cross-site" }],
  ])("a POST from %s", async (_, headers) => {
    const cookie = await signIn(accounts, ADA);
    const response = await signOut(cookie, headers);
    expect(response.status).toBe(403);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(response.headers.get("access-control-allow-origin")).toBe(null);
    expect((await askGateway(accounts, cookie)).status).toBe(200);
  });
});
