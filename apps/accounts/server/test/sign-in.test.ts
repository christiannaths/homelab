// Signing in on the accounts site: the page, the form's answers, where it sends the person after,
// and how attempts are limited.
import { beforeAll, describe, expect, it } from "vitest";
import { loadTestPeople, type TestPerson } from "../src/test-people.ts";
import {
  ACCOUNTS,
  ADA,
  askGateway,
  cookiesOf,
  DOMAIN,
  request,
  signIn,
  startAccounts,
  submitSignIn,
  type TestAccounts,
} from "./helpers.ts";

let accounts: TestAccounts;

beforeAll(async () => {
  accounts = await startAccounts();
});

describe("the sign-in page", () => {
  it("asks for an email and password, in the homelab look, with nothing to load first", async () => {
    const response = await request(
      accounts,
      `/sign-in?return-to=${encodeURIComponent(`https://notes.${DOMAIN}/`)}`,
    );
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('type="email"');
    expect(html).toContain('type="password"');
    expect(html).toContain(`value="https://notes.${DOMAIN}/"`);
    // The theme's light and dark surfaces, chosen by the device's setting.
    expect(html).toContain("#ffffff");
    expect(html).toContain("#1f1f1f");
    expect(html).toContain("prefers-color-scheme: dark");
    expect(html).not.toContain("<script");
  });

  it("sends a person who is already signed in straight on", async () => {
    const cookie = await signIn(accounts, ADA);
    const response = await request(
      accounts,
      `/sign-in?return-to=${encodeURIComponent(`https://notes.${DOMAIN}/`)}`,
      { headers: { cookie } },
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`https://notes.${DOMAIN}/`);
  });
});

describe("signing in", () => {
  it("returns to the app, with a year-long session cookie on the parent domain", async () => {
    const response = await submitSignIn(accounts, {
      ...ADA,
      returnTo: `https://notes.${DOMAIN}/page`,
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      `https://notes.${DOMAIN}/page`,
    );
    const cookie = response.headers
      .getSetCookie()
      .find((c) => c.startsWith("__Secure-homelab.session_token="));
    expect(cookie).toMatch(/Domain=\.?home\.test/i);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    const maxAge = Number(/Max-Age=(\d+)/i.exec(cookie ?? "")?.[1]);
    expect(maxAge).toBe(365 * 24 * 60 * 60);
    expect((await askGateway(accounts, cookiesOf(response))).status).toBe(200);
  });

  it("matches the email in any letter case", async () => {
    const response = await submitSignIn(accounts, {
      ...ADA,
      email: "  Ada@Example.COM ",
    });
    expect(response.status).toBe(303);
  });

  it("shows a wrong email or password on the same page, keeping the email and return address", async () => {
    for (const fields of [
      { email: ADA.email, password: "not-her-password" },
      { email: "nobody@example.com", password: ADA.password },
    ]) {
      const response = await submitSignIn(accounts, {
        ...fields,
        returnTo: `https://notes.${DOMAIN}/`,
      });
      expect(response.status).toBe(401);
      expect(response.headers.getSetCookie()).toEqual([]);
      const html = await response.text();
      expect(html).toContain("Wrong email or password");
      expect(html).toContain(`value="${fields.email}"`);
      expect(html).toContain(`value="https://notes.${DOMAIN}/"`);
    }
  });

  it("only sends people on to https addresses under the homelab's domain, or else to their account page", async () => {
    const accountPage = `${ACCOUNTS}/`;
    for (const [returnTo, expected] of [
      [
        `https://notes.${DOMAIN}:8443/x?y=1`,
        `https://notes.${DOMAIN}:8443/x?y=1`,
      ],
      [`https://${DOMAIN}/`, `https://${DOMAIN}/`],
      [undefined, accountPage],
      ["/relative", accountPage],
      [`http://notes.${DOMAIN}/`, accountPage],
      ["https://elsewhere.test/", accountPage],
      [`https://notes.${DOMAIN}.elsewhere.test/`, accountPage],
      [`https://evil${DOMAIN}/`, accountPage],
      [`https://user:pass@notes.${DOMAIN}/`, accountPage],
      ["javascript:alert(1)", accountPage],
    ] as const) {
      const response = await submitSignIn(accounts, { ...ADA, returnTo });
      expect(response.headers.get("location"), returnTo).toBe(expected);
    }
  });

  it("has no public sign-up", async () => {
    const response = await request(accounts, "/api/auth/sign-up/email", {
      method: "POST",
      headers: { "origin": ACCOUNTS, "content-type": "application/json" },
      body: JSON.stringify({
        name: "Mallory",
        email: "mallory@example.com",
        password: "lantern-meadow-copper",
      }),
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(
      (
        await submitSignIn(accounts, {
          email: "mallory@example.com",
          password: "lantern-meadow-copper",
        })
      ).status,
    ).toBe(401);
  });

  it("is refused from another site's form", async () => {
    const response = await request(accounts, "/sign-in", {
      method: "POST",
      headers: {
        "origin": "https://elsewhere.test",
        "content-type": "application/x-www-form-urlencoded",
        "x-forwarded-for": "192.0.2.1",
      },
      body: new URLSearchParams({ email: ADA.email, password: ADA.password }),
    });
    expect(response.status).toBe(403);
    expect(response.headers.getSetCookie()).toEqual([]);
  });
});

describe("signing out", () => {
  it("ends this device's session only, and shows the sign-in page", async () => {
    const phone = await signIn(accounts, ADA);
    const tablet = await signIn(accounts, ADA);
    const response = await request(accounts, "/sign-out", {
      headers: { cookie: tablet },
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/sign-in");
    const cleared = response.headers
      .getSetCookie()
      .find((c) => c.startsWith("__Secure-homelab.session_token="));
    expect(cleared).toMatch(/Max-Age=0/i);
    expect(cleared).toMatch(/Domain=\.?home\.test/i);
    expect((await askGateway(accounts, tablet)).status).toBe(302);
    expect((await askGateway(accounts, phone)).status).toBe(200);
  });
});

describe("sign-in attempts", () => {
  it("are limited per address the gateway saw, whatever a browser adds before it", async () => {
    const limited = await startAccounts([ADA], {
      signInRateLimit: { window: 60, max: 3 },
    });
    const attempt = (forwardedFor: string) =>
      limited.app.request(`${ACCOUNTS}/sign-in`, {
        method: "POST",
        headers: {
          "origin": ACCOUNTS,
          "content-type": "application/x-www-form-urlencoded",
          "x-forwarded-for": forwardedFor,
        },
        body: new URLSearchParams({ email: ADA.email, password: "guess" }),
      });
    for (let i = 0; i < 3; i++)
      expect((await attempt(`10.0.0.${i}, 192.0.2.7`)).status).toBe(401);
    const refused = await attempt("10.0.0.9, 192.0.2.7");
    expect(refused.status).toBe(429);
    expect(await refused.text()).toContain("Too many attempts");
    // Even the right password waits out the window.
    const right = await limited.app.request(`${ACCOUNTS}/sign-in`, {
      method: "POST",
      headers: {
        "origin": ACCOUNTS,
        "content-type": "application/x-www-form-urlencoded",
        "x-forwarded-for": "192.0.2.7",
      },
      body: new URLSearchParams({ email: ADA.email, password: ADA.password }),
    });
    expect(right.status).toBe(429);
    // Another address still signs in.
    expect((await attempt("192.0.2.8")).status).toBe(401);
  });
});

describe("passwords", () => {
  it("are accepted at 8 characters or more, and refused below", async () => {
    const short = {
      email: "short@example.com",
      password: "seven77",
      name: "Short",
    };
    await expect(loadAnother(short)).rejects.toThrow(/at least 8/);
    const eight = { ...short, password: "eight888" };
    await loadAnother(eight);
    expect((await submitSignIn(accounts, eight)).status).toBe(303);
  });
});

function loadAnother(person: TestPerson) {
  return loadTestPeople(accounts, [person]);
}
