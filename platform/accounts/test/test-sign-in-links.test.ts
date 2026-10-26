// The one-click sign-in links `npm run dev` prints for each test person, which only a service
// started for dev answers.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { configFromEnv } from "../src/config.ts";
import {
  ADA,
  askGateway,
  cookiesOf,
  DOMAIN,
  request,
  startAccounts,
  type TestAccounts,
} from "./helpers.ts";

const link = (email: string, returnTo?: string) =>
  `/test-sign-in?email=${encodeURIComponent(email)}` +
  (returnTo ? `&return-to=${encodeURIComponent(returnTo)}` : "");

describe("with test sign-in links on, as in dev", () => {
  let accounts: TestAccounts;
  beforeAll(async () => {
    accounts = await startAccounts(undefined, { testSignInLinks: true });
  });
  afterAll(() => accounts.close());

  it("signs the browser in as the person and goes on to the return address", async () => {
    const response = await request(
      accounts,
      link(ADA.email, `https://home.${DOMAIN}/`),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`https://home.${DOMAIN}/`);
    const answer = await askGateway(accounts, cookiesOf(response));
    expect(answer.status).toBe(200);
    expect(answer.headers.get("remote-email")).toBe(ADA.email);
  });

  it("sets the same year-long cookie on the parent domain as signing in does", async () => {
    const response = await request(accounts, link(ADA.email));
    const cookie = response.headers.getSetCookie()[0] ?? "";
    expect(cookie).toMatch(/^__Secure-homelab\.session_token=/);
    expect(cookie).toMatch(new RegExp(`Domain=${DOMAIN}`, "i"));
    expect(cookie).toMatch(/Max-Age=31536000/i);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
  });

  it("works every time, for any letter case", async () => {
    for (const email of [ADA.email, ADA.email.toUpperCase()]) {
      const response = await request(accounts, link(email));
      expect(response.status).toBe(302);
      const answer = await askGateway(accounts, cookiesOf(response));
      expect(answer.headers.get("remote-email")).toBe(ADA.email);
    }
  });

  it("knows no one who isn't a person in the service", async () => {
    const response = await request(accounts, link("nobody@example.com"));
    expect(response.status).toBe(404);
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("goes to the account page rather than off the homelab's domain", async () => {
    const response = await request(
      accounts,
      link(ADA.email, "https://evil.example/"),
    );
    expect(response.headers.get("location")).toBe(
      `https://accounts.${DOMAIN}/`,
    );
  });
});

describe("with test sign-in links off, as on every install and preview", () => {
  let accounts: TestAccounts;
  beforeAll(async () => {
    accounts = await startAccounts();
  });
  afterAll(() => accounts.close());

  it("has no such address", async () => {
    const response = await request(accounts, link(ADA.email));
    expect(response.status).toBe(404);
    expect(response.headers.getSetCookie()).toEqual([]);
  });
});

describe("the setting", () => {
  const env = {
    HOMELAB_DOMAIN: DOMAIN,
    ACCOUNTS_SECRET: "a-test-secret-that-is-at-least-32-characters",
  };

  it("is off unless TEST_SIGN_IN_LINKS is on", () => {
    expect(configFromEnv(env).testSignInLinks).toBe(false);
    expect(
      configFromEnv({ ...env, TEST_SIGN_IN_LINKS: "on" }).testSignInLinks,
    ).toBe(true);
  });

  it("refuses to start with it on in production", () => {
    expect(() =>
      configFromEnv({
        ...env,
        TEST_SIGN_IN_LINKS: "on",
        NODE_ENV: "production",
      }),
    ).toThrow(/production/);
  });
});
