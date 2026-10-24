// Keeping a session going while the person only uses apps (ADR-PLAT-004): the App switcher asks
// the accounts service on every page load, so a session in use is extended, cookie included.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
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
afterEach(() => {
  vi.useRealTimers();
});

const DAY = 24 * 60 * 60 * 1000;
const NOTES = `https://notes.${DOMAIN}`;

/** Asks as the App switcher's fetch from Notes' page does, unless `headers` say otherwise. */
function keepGoing(
  cookie: string,
  headers: Record<string, string> = {
    "origin": NOTES,
    "sec-fetch-site": "same-site",
    "sec-fetch-mode": "cors",
  },
): Promise<Response> {
  return request(accounts, "/session", {
    method: "POST",
    headers: { cookie, ...headers },
  });
}

const sessionCookieOf = (response: Response) =>
  response.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith("__Secure-homelab.session_token="));

describe("the App switcher keeping a session going", () => {
  it("gets another year, cookie included, a day or more after the last time", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date() });
    const cookie = await signIn(accounts, ADA);
    const sameDay = await keepGoing(cookie);
    expect(sameDay.status).toBe(204);
    expect(sessionCookieOf(sameDay)).toBeUndefined();

    vi.setSystemTime(Date.now() + 2 * DAY);
    const later = await keepGoing(cookie);
    expect(later.status).toBe(204);
    expect(sessionCookieOf(later)).toContain("Max-Age=31536000");
    expect(sessionCookieOf(later)).toContain(`Domain=${DOMAIN}`);
  });

  it("lets the app's page send cookies and read the answer", async () => {
    const response = await keepGoing(await signIn(accounts, ADA));
    expect(response.headers.get("access-control-allow-origin")).toBe(NOTES);
    expect(response.headers.get("access-control-allow-credentials")).toBe(
      "true",
    );
    expect(response.headers.get("vary")).toMatch(/origin/i);
  });

  it("answers a signed-out browser without signing it in", async () => {
    const response = await keepGoing("");
    expect(response.status).toBe(204);
    expect(sessionCookieOf(response)).toBeUndefined();
  });

  it("is refused from another site, and leaves the session as it was", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date() });
    const cookie = await signIn(accounts, ADA);
    vi.setSystemTime(Date.now() + 2 * DAY);
    const notFromTheHomelab: Record<string, string>[] = [
      { "origin": "https://evil.example", "sec-fetch-site": "cross-site" },
      { origin: `http://notes.${DOMAIN}` },
      {},
    ];
    for (const headers of notFromTheHomelab) {
      const response = await keepGoing(cookie, headers);
      expect(response.status).toBe(403);
      expect(sessionCookieOf(response)).toBeUndefined();
    }
    expect((await askGateway(accounts, cookie)).status).toBe(200);
  });
});
