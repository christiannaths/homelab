// Invites (ADR-PLAT-004): a homelab admin makes one on the People page for one email, with the App
// access it grants, and the invited person joins with its link. The first homelab admin joins with
// a setup invite the service prints on an empty install.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { loadTestPeople } from "../src/test-people.ts";
import {
  ACCOUNTS,
  ADA,
  ADMIN,
  askGateway,
  DOMAIN,
  request,
  signIn,
  startAccounts,
  whoIsSignedIn,
  submitSignIn,
  type TestAccounts,
} from "./helpers.ts";

let accounts: TestAccounts;
let admin = "";

beforeAll(async () => {
  accounts = await startAccounts();
  admin = await signIn(accounts, ADMIN);
});

afterEach(() => {
  vi.useRealTimers();
});

/** Posts a form as the browser does from one of the accounts site's pages. */
function submit(
  path: string,
  cookie: string,
  fields: Record<string, string> | [string, string][],
  headers: Record<string, string> = {},
) {
  return request(accounts, path, {
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

/** Makes an invite on the People page as the admin, and returns the page that shows its link. */
function makeInvite(
  email: string,
  apps: Record<string, string> = {},
  cookie = admin,
) {
  const fields: [string, string][] = [["email", email]];
  for (const [app, level] of Object.entries(apps))
    fields.push([`app-${app}`, level]);
  return submit("/people/invites", cookie, fields);
}

/** The invite link on the page shown after making one. */
function linkOn(html: string): string {
  const link = /value="(https:\/\/accounts\.home\.test\/join\/[^"]+)"/.exec(
    html,
  )?.[1];
  if (!link) throw new Error(`No invite link in ${html}`);
  return link;
}

async function newInviteLink(email: string, apps: Record<string, string> = {}) {
  const response = await makeInvite(email, apps);
  expect(response.status).toBe(200);
  return linkOn(await response.text());
}

/** Joins with an invite link as its page's form does, and returns the answer. */
function join(link: string, fields: Record<string, string>) {
  return submit(new URL(link).pathname, "", fields);
}

const cookiesOf = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");

const peoplePage = async (cookie = admin) =>
  (await request(accounts, "/people", { headers: { cookie } })).text();

describe("making an invite", () => {
  it("shows the link once, to pass on, and lists the invite as pending with its apps", async () => {
    const response = await makeInvite(" Edith@Example.com ", {
      notes: "member",
      encyclopedia: "admin",
    });
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(linkOn(html)).toMatch(
      /^https:\/\/accounts\.home\.test\/join\/.{40,}$/,
    );
    expect(html).toContain("edith@example.com");

    const later = await peoplePage();
    expect(later).toContain("edith@example.com");
    expect(later).toMatch(/Encyclopedia \(Admin\), Notes \(Member\)/);
    expect(later).not.toContain(linkOn(html));
  });

  it("offers each installed app by its manifest's name, with member and admin", async () => {
    const html = await peoplePage();
    expect(html).toMatch(/<select name="app-notes"[^>]*>/);
    expect(html).toMatch(/<select name="app-encyclopedia"[^>]*>/);
    expect(html).toContain("Notes");
    expect(html).toContain("Encyclopedia");
    expect(html).toContain('<option value="member">Member</option>');
    expect(html).toContain('<option value="admin">Admin</option>');
  });

  it("needs an email", async () => {
    const response = await makeInvite("  ", { notes: "member" });
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("Enter the email to invite.");
  });

  it("refuses an app that isn't installed, or a level that doesn't exist", async () => {
    const refused: Record<string, string>[] = [
      { vault: "member" },
      { notes: "owner" },
    ];
    for (const apps of refused) {
      const response = await makeInvite("frances@example.com", apps);
      expect(response.status, JSON.stringify(apps)).toBe(400);
      expect(await response.text()).not.toContain("/join/");
    }
    expect(await peoplePage()).not.toContain("frances@example.com");
  });

  it("refuses an email that already has an account", async () => {
    const response = await makeInvite("ADA@example.com", { notes: "member" });
    expect(response.status).toBe(400);
    expect(await response.text()).toContain(
      "ada@example.com already has an account.",
    );
  });
});

describe("joining with an invite", () => {
  it("asks for a name and password, with the invite's email filled in and fixed", async () => {
    const link = await newInviteLink("joan@example.com", { notes: "member" });
    const response = await request(accounts, link);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toMatch(
      /<input name="email"[^>]*value="joan@example\.com"[^>]*readonly/,
    );
    expect(html).toContain('name="name"');
    expect(html).toContain('name="password"');
    expect(html).not.toContain("<script");
  });

  it("makes the account with the invite's App access, signs the person in and shows their account page", async () => {
    const link = await newInviteLink("rosalind@example.com", {
      notes: "admin",
      encyclopedia: "member",
    });
    const response = await join(link, {
      name: "Rosalind Franklin",
      password: "helix-photo-fifty-one",
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/");
    const cookie = cookiesOf(response);

    const page = await (
      await request(accounts, "/", { headers: { cookie } })
    ).text();
    expect(page).toContain("<h1>Rosalind Franklin</h1>");
    expect(page).toMatch(/Notes<\/a>\s*<span[^>]*>Admin<\/span>/);
    expect(page).not.toContain("/people");

    const gateway = await askGateway(accounts, cookie);
    expect(gateway.status).toBe(200);
    expect(gateway.headers.get("remote-email")).toBe("rosalind@example.com");
    expect(gateway.headers.get("remote-groups")).toBe(
      "encyclopedia,notes-admins",
    );

    const signedIn = await submitSignIn(accounts, {
      email: "rosalind@example.com",
      password: "helix-photo-fifty-one",
    });
    expect(signedIn.status).toBe(303);
    const people = await peoplePage();
    const pending = people.slice(
      people.indexOf("<h2>Pending invites</h2>"),
      people.indexOf("<h2>Everyone</h2>"),
    );
    expect(pending).not.toContain("rosalind@example.com");
  });

  it("works only for the invite's email, whatever the form sends", async () => {
    const link = await newInviteLink("lise@example.com");
    const response = await join(link, {
      email: "mallory@example.com",
      name: "Lise Meitner",
      password: "fission-in-the-snow",
    });
    expect(response.status).toBe(303);
    expect(
      (await whoIsSignedIn(accounts, cookiesOf(response)))?.person.email,
    ).toBe("lise@example.com");
    expect(
      (
        await submitSignIn(accounts, {
          email: "mallory@example.com",
          password: "fission-in-the-snow",
        })
      ).status,
    ).toBe(401);
  });

  it("works once", async () => {
    const link = await newInviteLink("chien@example.com");
    const fields = {
      name: "Chien-Shiung Wu",
      password: "parity-not-conserved",
    };
    expect((await join(link, fields)).status).toBe(303);

    const again = await join(link, { ...fields, password: "another-password" });
    expect(again.status).toBe(410);
    expect(await again.text()).toContain("This invite can't be used");
    const page = await request(accounts, link);
    expect(page.status).toBe(410);
    expect(await page.text()).toContain("This invite can't be used");
  });

  it("makes nothing and keeps the invite when making the account fails part way", async () => {
    const link = await newInviteLink("sophie@example.com", { notes: "member" });
    const fields = {
      name: "Sophie Germain",
      password: "prime-numbers-of-hers",
    };
    const failing = vi
      .spyOn(accounts.appAccess, "set")
      .mockImplementationOnce(() => {
        throw new Error("disk full");
      });
    expect((await join(link, fields)).status).toBe(500);
    failing.mockRestore();

    const refused = await submitSignIn(accounts, {
      email: "sophie@example.com",
      password: fields.password,
    });
    expect(refused.status).toBe(401);
    expect((await request(accounts, link)).status).toBe(200);
    const joined = await join(link, fields);
    expect(joined.status).toBe(303);
    expect(
      (await askGateway(accounts, cookiesOf(joined))).headers.get(
        "remote-groups",
      ),
    ).toBe("notes");
  });

  it("makes one account when two invites for one email join at once, and refuses the other", async () => {
    const first = await newInviteLink("grace@example.com");
    const second = await newInviteLink("grace@example.com");
    const answers = await Promise.all([
      join(first, { name: "Grace One", password: "first-of-the-two" }),
      join(second, { name: "Grace Two", password: "second-of-the-two" }),
    ]);
    expect(
      answers.map((answer) => answer.status).toSorted((a, b) => a - b),
    ).toEqual([303, 410]);
    const ctx = await accounts.betterAuth.$context;
    const users = await ctx.internalAdapter.listUsers(1000);
    expect(
      users.filter((user) => user.email === "grace@example.com"),
    ).toHaveLength(1);
  });

  it("expires after a week", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date() });
    const link = await newInviteLink("mary@example.com");
    vi.setSystemTime(Date.now() + 6.9 * 24 * 60 * 60 * 1000);
    expect((await request(accounts, link)).status).toBe(200);
    vi.setSystemTime(Date.now() + 0.2 * 24 * 60 * 60 * 1000);
    expect((await request(accounts, link)).status).toBe(410);
    const response = await join(link, {
      name: "Mary Somerville",
      password: "connexion-of-sciences",
    });
    expect(response.status).toBe(410);
    expect(await peoplePage()).not.toContain("mary@example.com");
  });

  it("can't be used with a made-up link", async () => {
    const response = await request(accounts, "/join/not-an-invite");
    expect(response.status).toBe(410);
    expect(await response.text()).toContain("This invite can't be used");
  });

  it("needs a name and a password of at least 8 characters, and keeps the invite until then", async () => {
    const link = await newInviteLink("emmy@example.com");
    const noName = await join(link, {
      name: " ",
      password: "rings-and-ideals",
    });
    expect(noName.status).toBe(400);
    expect(await noName.text()).toContain("Enter your name.");
    const short = await join(link, {
      name: "Emmy Noether",
      password: "seven77",
    });
    expect(short.status).toBe(400);
    expect(await short.text()).toContain(
      "Use a password of at least 8 characters.",
    );
    expect(
      (await join(link, { name: "Emmy Noether", password: "rings-and-ideals" }))
        .status,
    ).toBe(303);
  });

  it("is refused from another site", async () => {
    const link = await newInviteLink("hypatia@example.com");
    const response = await submit(
      new URL(link).pathname,
      "",
      { name: "Hypatia", password: "conic-sections-1" },
      { "origin": `https://notes.${DOMAIN}`, "sec-fetch-site": "same-site" },
    );
    expect(response.status).toBe(403);
    expect((await request(accounts, link)).status).toBe(200);
  });
});

describe("cancelling an invite", () => {
  it("stops its link working and takes it off the pending list", async () => {
    const link = await newInviteLink("barbara@example.com");
    const html = await peoplePage();
    const id = new RegExp(
      `barbara@example\\.com[\\s\\S]*?action="/people/invites/([^/"]+)/cancel"`,
    ).exec(html)?.[1];
    expect(id).toBeDefined();
    const response = await submit(`/people/invites/${id}/cancel`, admin, {});
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/people");
    expect(await peoplePage()).not.toContain("barbara@example.com");
    expect((await request(accounts, link)).status).toBe(410);
  });
});

describe("the People page's invite actions", () => {
  it("refuse anyone who isn't a homelab admin", async () => {
    const ada = await signIn(accounts, ADA);
    const link = await newInviteLink("dorothy@example.com");
    const html = await peoplePage();
    const id = /action="\/people\/invites\/([^/"]+)\/cancel"/.exec(html)?.[1];

    const made = await makeInvite("eve@example.com", { notes: "admin" }, ada);
    expect(made.status).toBe(403);
    expect(await made.text()).not.toContain("/join/");
    const cancelled = await submit(`/people/invites/${id}/cancel`, ada, {});
    expect(cancelled.status).toBe(403);

    expect(await peoplePage()).not.toContain("eve@example.com");
    expect((await request(accounts, link)).status).toBe(200);
  });

  it("send a signed-out browser to sign in", async () => {
    const response = await makeInvite("eve@example.com", {}, "");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      `${ACCOUNTS}/sign-in?return-to=${encodeURIComponent(`${ACCOUNTS}/people`)}`,
    );
  });

  it("are refused from another site", async () => {
    const response = await submit(
      "/people/invites",
      admin,
      { email: "eve@example.com" },
      { "origin": `https://notes.${DOMAIN}`, "sec-fetch-site": "same-site" },
    );
    expect(response.status).toBe(403);
    expect(await peoplePage()).not.toContain("eve@example.com");
  });
});

describe("the setup invite", () => {
  it("is made on an empty install, and makes the first homelab admin", async () => {
    const empty = await startAccounts([]);
    const link = empty.setupInvite();
    expect(link).toMatch(/^https:\/\/accounts\.home\.test\/join\/.{40,}$/);

    const page = await empty.app.request(link!);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toMatch(/<input name="email"[^>]*type="email"/);
    expect(html).not.toMatch(/<input name="email"[^>]*readonly/);

    const response = await empty.app.request(link!, {
      method: "POST",
      headers: {
        "origin": ACCOUNTS,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        email: "Owner@Example.com",
        name: "Homelab Owner",
        password: "first-of-the-household",
      }),
    });
    expect(response.status).toBe(303);
    const cookie = cookiesOf(response);
    const people = await empty.app.request(`${ACCOUNTS}/people`, {
      headers: { cookie },
    });
    expect(people.status).toBe(200);
    expect(await whoIsSignedIn(empty, cookie)).toMatchObject({
      person: { email: "owner@example.com" },
      apps: [],
    });

    expect((await empty.app.request(link!)).status).toBe(410);
    expect(empty.setupInvite()).toBeUndefined();
  });

  it("isn't made once there are accounts", async () => {
    expect(accounts.setupInvite()).toBeUndefined();
  });

  it("stops working once someone has an account", async () => {
    const empty = await startAccounts([]);
    const link = empty.setupInvite();
    await loadTestPeople(empty, [ADA]);
    expect((await empty.app.request(link!)).status).toBe(410);
  });
});
