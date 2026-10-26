// The gateway's sign-in check (platform/gateway/signed-in.caddyfile) asks this service about every
// request to an app: who may go on, with which headers, and who is sent to sign in or refused.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { loadTestPeople } from "../src/test-people.ts";
import {
  ACCOUNTS,
  ADA,
  ADMIN,
  askGateway,
  BOB,
  DOMAIN,
  signIn,
  startAccounts,
  type TestAccounts,
} from "./helpers.ts";

let accounts: TestAccounts;
let ada = "";

beforeAll(async () => {
  accounts = await startAccounts();
  ada = await signIn(accounts, ADA);
});

describe("a signed-out browser", () => {
  it("is sent to sign in, and back to where it was going", async () => {
    const response = await askGateway(
      accounts,
      "",
      `notes.${DOMAIN}:8443`,
      "/page?id=1",
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      `${ACCOUNTS}/sign-in?return-to=${encodeURIComponent(`https://notes.${DOMAIN}:8443/page?id=1`)}`,
    );
  });

  it("is sent to sign in with a cookie that holds no session", async () => {
    const response = await askGateway(
      accounts,
      "__Secure-homelab.session_token=forged",
    );
    expect(response.status).toBe(302);
  });
});

describe("a signed-in person", () => {
  it("goes on to an app they have, with their account id, name, email and App access", async () => {
    const response = await askGateway(accounts, ada);
    expect(response.status).toBe(200);
    expect(Object.fromEntries(remoteHeaders(response))).toEqual({
      "remote-user": accounts.ids[ADA.email],
      "remote-name": "Ada Lovelace",
      "remote-email": "ada@example.com",
      "remote-groups": "encyclopedia,notes-admins",
    });
    expect(accounts.ids[ADA.email]).toMatch(/^\w{16,}$/);
  });

  it("goes on to Home, which every account opens, with all four headers even with no apps", async () => {
    const bob = await signIn(accounts, BOB);
    const response = await askGateway(accounts, bob, `home.${DOMAIN}`);
    expect(response.status).toBe(200);
    expect(Object.fromEntries(remoteHeaders(response))).toEqual({
      "remote-user": accounts.ids[BOB.email],
      "remote-name": "Bob Ross",
      "remote-email": "bob@example.com",
      "remote-groups": "",
    });
  });

  it("gets the no-access page for an app they don't have", async () => {
    const bob = await signIn(accounts, BOB);
    const response = await askGateway(accounts, bob);
    expect(response.status).toBe(403);
    expect(response.headers.get("content-type")).toMatch(/^text\/html/);
    expect(await response.text()).toContain("You don't have access to Notes");
  });

  it("is refused at a hostname that isn't an installed app directly under the domain", async () => {
    for (const host of [
      `vault.${DOMAIN}`,
      `accounts.${DOMAIN}`,
      DOMAIN,
      `a.notes.${DOMAIN}`,
      "notes.elsewhere.test",
      `notes.${DOMAIN}.elsewhere.test`,
    ])
      expect((await askGateway(accounts, ada, host)).status, host).toBe(403);
  });

  it("loses an app on their next request once it is taken away", async () => {
    const dana = {
      email: "dana@example.com",
      password: "quartz-ember-willow-27",
      name: "Dana Scully",
    };
    await loadTestPeople(accounts, [{ ...dana, apps: { notes: "member" } }]);
    const cookie = await signIn(accounts, dana);
    expect((await askGateway(accounts, cookie)).status).toBe(200);
    await loadTestPeople(accounts, [dana]);
    expect((await askGateway(accounts, cookie)).status).toBe(403);
  });

  it("can be given only installed apps, and opens none that isn't installed any more", async () => {
    await expect(
      loadTestPeople(accounts, [{ ...BOB, apps: { vault: "member" } }]),
    ).rejects.toThrow(/vault isn't an installed app/);

    const dataDir = mkdtempSync(path.join(tmpdir(), "accounts-"));
    const before = await startAccounts([ADA], { dataDir });
    const cookie = await signIn(before, ADA);
    before.close();
    const uninstalled = await startAccounts([], {
      dataDir,
      apps: ["encyclopedia"],
    });
    expect((await askGateway(uninstalled, cookie)).status).toBe(403);
    const home = await askGateway(uninstalled, cookie, `home.${DOMAIN}`);
    expect(home.headers.get("remote-groups")).toBe("encyclopedia");
  });

  it("as a homelab admin, opens no app they weren't given, and gets no group for it", async () => {
    const admin = await signIn(accounts, ADMIN);
    expect((await askGateway(accounts, admin)).status).toBe(403);
    const home = await askGateway(accounts, admin, `home.${DOMAIN}`);
    expect(home.headers.get("remote-groups")).toBe("");
  });

  it("is percent-encoded where a name can't be a raw header", async () => {
    await loadTestPeople(accounts, [{ ...ADA, name: "Zoë Ångström" }]);
    const response = await askGateway(accounts, ada);
    expect(response.headers.get("remote-name")).toBe(
      encodeURIComponent("Zoë Ångström"),
    );
    await loadTestPeople(accounts, [ADA]);
  });
});

function remoteHeaders(response: Response): [string, string][] {
  return [...response.headers].filter(([name]) => name.startsWith("remote-"));
}
