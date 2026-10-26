// Managing people on the People page (ADR-PLAT-004): a homelab admin sees everyone with their
// apps, changes their App access, makes or unmakes homelab admins, signs people out everywhere
// and removes accounts. The homelab always keeps at least one homelab admin.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADA,
  ADMIN,
  askGateway,
  BOB,
  cookiesOf,
  DOMAIN,
  request,
  signIn,
  startAccounts,
  submitForm,
  submitSignIn,
  type TestAccounts,
} from "./helpers.ts";

async function peoplePage(accounts: TestAccounts, cookie: string) {
  const response = await request(accounts, "/people", { headers: { cookie } });
  expect(response.status).toBe(200);
  return response.text();
}

/** The part of the People page's list about one person, by their email. */
function entryOf(html: string, email: string): string {
  const list = html.slice(html.indexOf('<ul aria-label="People">'));
  const entries = list
    .split('<li class="person"')
    .filter((entry) => entry.includes(email));
  expect(entries, email).toHaveLength(1);
  return entries[0];
}

describe("the People page", () => {
  it("lists everyone, with their email and each app's name, icon and level", async () => {
    const accounts = await startAccounts();
    const html = await peoplePage(accounts, await signIn(accounts, ADMIN));
    const ada = entryOf(html, "ada@example.com");
    expect(ada).toContain("<h3>Ada Lovelace</h3>");
    expect(ada).toContain(
      `<img src="https://notes.${DOMAIN}/icons/icon-192.png" alt="">`,
    );
    expect(ada).toMatch(/Notes<\/span>\s*<span[^>]*>Admin<\/span>/);
    expect(ada).toMatch(/Encyclopedia<\/span>\s*<span[^>]*>Member<\/span>/);
    expect(ada).not.toContain("Homelab admin</p>");

    const bob = entryOf(html, "bob@example.com");
    expect(bob).toContain("<h3>Bob Ross</h3>");
    expect(bob).toContain("No apps");

    const admin = entryOf(html, "admin@example.com");
    expect(admin).toContain("<h3>Homelab Admin</h3>");
    expect(admin).toContain("Homelab admin</p>");
    expect(html).not.toContain("<script");
  });

  it("offers each installed app at member or admin for each person, chosen as they have it", async () => {
    const accounts = await startAccounts();
    const html = await peoplePage(accounts, await signIn(accounts, ADMIN));
    const ada = entryOf(html, "ada@example.com");
    expect(ada).toContain(
      `action="/people/${accounts.ids["ada@example.com"]}/apps"`,
    );
    expect(ada).toMatch(
      /<select name="app-notes"[^>]*>.*<option value="admin" selected>/,
    );
    expect(ada).toMatch(
      /<select name="app-encyclopedia"[^>]*>.*<option value="member" selected>/,
    );
    expect(entryOf(html, "bob@example.com")).not.toMatch(
      /value="(member|admin)" selected/,
    );
  });
});

describe("changing someone's App access", () => {
  it("grants, re-levels and takes away apps, taking effect on the person's next request", async () => {
    const accounts = await startAccounts();
    const admin = await signIn(accounts, ADMIN);
    const ada = await signIn(accounts, ADA);
    const apps = `/people/${accounts.ids["ada@example.com"]}/apps`;

    const changed = await submitForm(accounts, apps, admin, {
      "app-notes": "member",
      "app-encyclopedia": "",
    });
    expect(changed.status).toBe(303);
    expect(changed.headers.get("location")).toBe("/people");
    const notes = await askGateway(accounts, ada);
    expect(notes.status).toBe(200);
    expect(notes.headers.get("remote-groups")).toBe("notes");
    expect(
      (await askGateway(accounts, ada, `encyclopedia.${DOMAIN}`)).status,
    ).toBe(403);

    await submitForm(accounts, apps, admin, {
      "app-notes": "",
      "app-encyclopedia": "admin",
    });
    expect((await askGateway(accounts, ada)).status).toBe(403);
    expect(
      (await askGateway(accounts, ada, `encyclopedia.${DOMAIN}`)).headers.get(
        "remote-groups",
      ),
    ).toBe("encyclopedia-admins");
  });

  it("keeps App access to an app no longer installed, for when it is installed again", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "accounts-"));
    const withWiki = await startAccounts(
      [{ ...ADA, apps: { notes: "member", wiki: "admin" } }],
      { dataDir, apps: ["notes", "encyclopedia", "wiki"] },
    );
    const adaId = withWiki.ids[ADA.email];
    withWiki.close();

    const without = await startAccounts([ADMIN], { dataDir });
    const admin = await signIn(without, ADMIN);
    const saved = await submitForm(without, `/people/${adaId}/apps`, admin, {
      "app-notes": "admin",
    });
    expect(saved.status).toBe(303);
    without.close();

    const again = await startAccounts([], {
      dataDir,
      apps: ["notes", "encyclopedia", "wiki"],
    });
    expect(again.appAccess.of(adaId)).toEqual({
      notes: "admin",
      wiki: "admin",
    });
    again.close();
  });

  it("lets admins give themselves apps the same way", async () => {
    const accounts = await startAccounts();
    const admin = await signIn(accounts, ADMIN);
    expect((await askGateway(accounts, admin)).status).toBe(403);
    await submitForm(
      accounts,
      `/people/${accounts.ids["admin@example.com"]}/apps`,
      admin,
      { "app-notes": "member" },
    );
    expect((await askGateway(accounts, admin)).status).toBe(200);
  });

  it("refuses an app that isn't installed, or a level that doesn't exist, and changes nothing", async () => {
    const accounts = await startAccounts();
    const admin = await signIn(accounts, ADMIN);
    const ada = await signIn(accounts, ADA);
    const apps = `/people/${accounts.ids["ada@example.com"]}/apps`;
    const refused: Record<string, string>[] = [
      { "app-notes": "member", "app-vault": "member" },
      { "app-notes": "owner" },
    ];
    for (const fields of refused) {
      const response = await submitForm(accounts, apps, admin, fields);
      expect(response.status, JSON.stringify(fields)).toBe(400);
      expect(await response.text()).toMatch(/<p role="alert">[^<]+<\/p>/);
    }
    expect((await askGateway(accounts, ada)).headers.get("remote-groups")).toBe(
      "encyclopedia,notes-admins",
    );
  });
});

/** Turns the person's homelab admin switch on or off, as the given admin. */
function setHomelabAdmin(
  accounts: TestAccounts,
  cookie: string,
  email: string,
  on: boolean,
) {
  return submitForm(
    accounts,
    `/people/${accounts.ids[email]}/homelab-admin`,
    cookie,
    { "homelab-admin": on ? "on" : "off" },
  );
}

const opensPeople = async (accounts: TestAccounts, cookie: string) =>
  (await request(accounts, "/people", { headers: { cookie } })).status;

describe("the homelab admin switch", () => {
  it("makes someone a homelab admin, and stops them being one, from their next request", async () => {
    const accounts = await startAccounts();
    const admin = await signIn(accounts, ADMIN);
    const ada = await signIn(accounts, ADA);
    expect(await opensPeople(accounts, ada)).toBe(403);

    const made = await setHomelabAdmin(accounts, admin, ADA.email, true);
    expect(made.status).toBe(303);
    expect(made.headers.get("location")).toBe("/people");
    expect(await opensPeople(accounts, ada)).toBe(200);
    expect(entryOf(await peoplePage(accounts, admin), ADA.email)).toContain(
      "Stop being a homelab admin",
    );

    await setHomelabAdmin(accounts, admin, ADA.email, false);
    expect(await opensPeople(accounts, ada)).toBe(403);
  });

  it("lets an admin stop being one while another admin is left", async () => {
    const accounts = await startAccounts();
    const admin = await signIn(accounts, ADMIN);
    await setHomelabAdmin(accounts, admin, ADA.email, true);
    const stopped = await setHomelabAdmin(accounts, admin, ADMIN.email, false);
    expect(stopped.status).toBe(303);
    expect(await opensPeople(accounts, admin)).toBe(403);
  });

  it("refuses to stop the last homelab admin being one, even when it's yourself", async () => {
    const accounts = await startAccounts();
    const admin = await signIn(accounts, ADMIN);
    const refused = await setHomelabAdmin(accounts, admin, ADMIN.email, false);
    expect(refused.status).toBe(409);
    expect(await refused.text()).toContain(
      "The homelab needs at least one homelab admin.",
    );
    expect(await opensPeople(accounts, admin)).toBe(200);
  });
});

describe("signing someone out everywhere", () => {
  it("ends every session they have, so each device goes to sign in on its next request", async () => {
    const accounts = await startAccounts();
    const admin = await signIn(accounts, ADMIN);
    const phone = await signIn(accounts, ADA);
    const tablet = await signIn(accounts, ADA);
    const response = await submitForm(
      accounts,
      `/people/${accounts.ids[ADA.email]}/sign-out`,
      admin,
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/people");
    for (const device of [phone, tablet]) {
      const gateway = await askGateway(accounts, device);
      expect(gateway.status).toBe(302);
      expect(gateway.headers.get("location")).toMatch(
        /^https:\/\/accounts\.home\.test\/sign-in\?/,
      );
    }
    expect(await opensPeople(accounts, admin)).toBe(200);
    expect((await signIn(accounts, ADA)).length).toBeGreaterThan(0);
  });
});

describe("removing an account", () => {
  const remove = (accounts: TestAccounts, cookie: string, email: string) =>
    submitForm(accounts, `/people/${accounts.ids[email]}/remove`, cookie);

  it("signs the person out everywhere, ends their App access and takes them off the list", async () => {
    const accounts = await startAccounts();
    const admin = await signIn(accounts, ADMIN);
    const ada = await signIn(accounts, ADA);
    const response = await remove(accounts, admin, ADA.email);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/people");

    expect((await askGateway(accounts, ada)).status).toBe(302);
    expect((await submitSignIn(accounts, ADA)).status).toBe(401);
    const html = await peoplePage(accounts, admin);
    expect(html).not.toContain(ADA.email);
  });

  it("deletes the invites the person made", async () => {
    const accounts = await startAccounts();
    const admin = await signIn(accounts, ADMIN);
    await setHomelabAdmin(accounts, admin, ADA.email, true);
    const ada = await signIn(accounts, ADA);
    const made = await submitForm(accounts, "/people/invites", ada, {
      email: "joan@example.com",
    });
    const link = /value="(https:\/\/accounts\.home\.test\/join\/[^"]+)"/.exec(
      await made.text(),
    )?.[1];
    expect(link).toBeDefined();

    await remove(accounts, admin, ADA.email);
    expect(await peoplePage(accounts, admin)).not.toContain("joan@example.com");
    expect((await request(accounts, link!)).status).toBe(410);
  });

  it("lets the same email be invited again, as a new person with a new account id and no old App access", async () => {
    const accounts = await startAccounts();
    const admin = await signIn(accounts, ADMIN);
    const oldId = accounts.ids[ADA.email];
    await remove(accounts, admin, ADA.email);

    const made = await submitForm(accounts, "/people/invites", admin, {
      email: ADA.email,
    });
    expect(made.status).toBe(200);
    const link = /value="(https:\/\/accounts\.home\.test\/join\/[^"]+)"/.exec(
      await made.text(),
    )?.[1];
    const joined = await submitForm(accounts, new URL(link!).pathname, "", {
      name: "Ada King",
      password: "analytical-engine-2",
    });
    expect(joined.status).toBe(303);
    const gateway = await askGateway(
      accounts,
      cookiesOf(joined),
      `home.${DOMAIN}`,
    );
    expect(gateway.status).toBe(200);
    expect(gateway.headers.get("remote-user")).not.toBe(oldId);
    expect(gateway.headers.get("remote-groups")).toBe("");
  });

  it("lets an admin remove themselves while another admin is left", async () => {
    const accounts = await startAccounts();
    const admin = await signIn(accounts, ADMIN);
    await setHomelabAdmin(accounts, admin, ADA.email, true);
    expect((await remove(accounts, admin, ADMIN.email)).status).toBe(303);
    expect((await askGateway(accounts, admin)).status).toBe(302);
  });

  it("refuses to remove the last homelab admin, even when it's yourself", async () => {
    const accounts = await startAccounts();
    const admin = await signIn(accounts, ADMIN);
    const refused = await remove(accounts, admin, ADMIN.email);
    expect(refused.status).toBe(409);
    expect(await refused.text()).toContain(
      "The homelab needs at least one homelab admin.",
    );
    expect(await opensPeople(accounts, admin)).toBe(200);
  });
});

describe("the People page's actions on people", () => {
  const actions = (
    accounts: TestAccounts,
  ): [string, Record<string, string>][] => {
    const bob = accounts.ids[BOB.email];
    return [
      [`/people/${bob}/apps`, { "app-notes": "admin" }],
      [`/people/${bob}/homelab-admin`, { "homelab-admin": "on" }],
      [`/people/${bob}/sign-out`, {}],
      [`/people/${bob}/remove`, {}],
    ];
  };

  /** Bob's account is just as it was loaded, and his session still works. */
  async function bobUnchanged(accounts: TestAccounts, bob: string) {
    const gateway = await askGateway(accounts, bob, `home.${DOMAIN}`);
    expect(gateway.status).toBe(200);
    expect(gateway.headers.get("remote-groups")).toBe("");
    expect(await opensPeople(accounts, bob)).toBe(403);
  }

  it("refuse anyone who isn't a homelab admin", async () => {
    const accounts = await startAccounts();
    const ada = await signIn(accounts, ADA);
    const bob = await signIn(accounts, BOB);
    for (const [path, fields] of actions(accounts)) {
      const response = await submitForm(accounts, path, ada, fields);
      expect(response.status, path).toBe(403);
    }
    await bobUnchanged(accounts, bob);
  });

  it("are refused from another site, even with an admin's session", async () => {
    const accounts = await startAccounts();
    const admin = await signIn(accounts, ADMIN);
    const bob = await signIn(accounts, BOB);
    for (const [path, fields] of actions(accounts)) {
      for (const headers of [
        { "origin": `https://notes.${DOMAIN}`, "sec-fetch-site": "same-site" },
        { "origin": "https://example.org", "sec-fetch-site": "cross-site" },
      ]) {
        const response = await submitForm(
          accounts,
          path,
          admin,
          fields,
          headers,
        );
        expect(response.status, `${path} from ${headers.origin}`).toBe(403);
      }
    }
    await bobUnchanged(accounts, bob);
  });

  it("send a signed-out browser to sign in", async () => {
    const accounts = await startAccounts();
    for (const [path, fields] of actions(accounts)) {
      const response = await submitForm(accounts, path, "", fields);
      expect(response.status, path).toBe(303);
      expect(response.headers.get("location")).toMatch(
        /^https:\/\/accounts\.home\.test\/sign-in\?/,
      );
    }
  });

  it("say so for someone who has no account", async () => {
    const accounts = await startAccounts();
    const admin = await signIn(accounts, ADMIN);
    for (const action of ["apps", "homelab-admin", "sign-out", "remove"]) {
      const response = await submitForm(
        accounts,
        `/people/no-such-person/${action}`,
        admin,
        { "homelab-admin": "on" },
      );
      expect(response.status, action).toBe(404);
      expect(await response.text()).toContain(
        "That person has no account any more.",
      );
    }
  });
});
