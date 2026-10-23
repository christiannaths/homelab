// The accounts service end to end in one process, without the gateway or a browser: an invite
// makes an account, and the gateway's question is answered from its session cookie.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { createAccounts } from "../src/app.ts";
import { isRecord } from "../src/parse.ts";

const ACCOUNTS = "https://accounts.home.test";
let accounts: Awaited<ReturnType<typeof createAccounts>>;

beforeAll(async () => {
  accounts = await createAccounts({
    domain: "home.test",
    accountsUrl: ACCOUNTS,
    secret: "a-test-secret-that-is-at-least-32-characters",
    dataDir: mkdtempSync(path.join(tmpdir(), "accounts-")),
    port: 0,
    signInRateLimit: { window: 60, max: 100 },
  });
});

function request(url: string, init: RequestInit = {}) {
  return accounts.app.request(new URL(url, ACCOUNTS).href, init);
}

function cookiesOf(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

async function acceptInvite(link: string, fields: Record<string, string>) {
  return request(link, {
    method: "POST",
    headers: { origin: ACCOUNTS },
    body: new URLSearchParams(fields),
  });
}

function askGateway(cookie: string, host = "notes.home.test") {
  return request("/api/authz/forward-auth", {
    headers: {
      cookie,
      "x-forwarded-proto": "https",
      "x-forwarded-host": host,
      "x-forwarded-uri": "/",
    },
  });
}

describe("accounts", () => {
  let adminCookie = "";

  it("prints a first-run invite that makes the first admin", async () => {
    const link = accounts.firstRunLink();
    expect(link).toMatch(`${ACCOUNTS}/invite/`);
    const response = await acceptInvite(link!, {
      name: "Admin",
      email: "Admin@Example.com",
      password: "correct-horse-battery",
    });
    expect(response.status).toBe(302);
    adminCookie = cookiesOf(response);
    expect(adminCookie).toContain("__Secure-homelab.session_token=");
    expect(accounts.firstRunLink()).toBeUndefined();
  });

  it("an invite can be used once", async () => {
    const created = await request("/admin/invites", {
      method: "POST",
      headers: {
        "cookie": adminCookie,
        "origin": ACCOUNTS,
        "content-type": "application/json",
      },
      body: JSON.stringify({ groups: ["notes"] }),
    });
    const json: unknown = await created.json();
    const url = isRecord(json) && typeof json.url === "string" ? json.url : "";
    const first = await acceptInvite(url, {
      name: "Ada",
      email: "ada@example.com",
      password: "lantern-meadow-copper",
    });
    expect(first.status).toBe(302);
    const again = await acceptInvite(url, {
      name: "Eve",
      email: "eve@example.com",
      password: "lantern-meadow-copper",
    });
    expect(again.status).toBe(410);

    const allowed = await askGateway(cookiesOf(first));
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("remote-email")).toBe("ada@example.com");
    expect(allowed.headers.get("remote-groups")).toBe("notes");
    expect(
      (await askGateway(cookiesOf(first), "encyclopedia.home.test")).status,
    ).toBe(403);
  });

  it("only admins make invites, and only from the accounts page", async () => {
    const body = JSON.stringify({ groups: ["auth_admins"] });
    expect(
      (
        await request("/admin/invites", {
          method: "POST",
          headers: { "origin": ACCOUNTS, "content-type": "application/json" },
          body,
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await request("/admin/invites", {
          method: "POST",
          headers: {
            "cookie": adminCookie,
            "origin": "https://notes.home.test",
            "content-type": "application/json",
          },
          body,
        })
      ).status,
    ).toBe(400);
  });

  it("sends a browser with no session to sign in", async () => {
    const response = await askGateway("");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toMatch(
      `${ACCOUNTS}/sign-in?return-to=`,
    );
  });

  it("public sign-up is closed", async () => {
    const response = await request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "origin": ACCOUNTS, "content-type": "application/json" },
      body: JSON.stringify({
        name: "Mallory",
        email: "mallory@example.com",
        password: "lantern-meadow-copper",
      }),
    });
    expect(response.status).toBe(400);
  });
});
