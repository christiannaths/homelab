// A person's account page on the accounts site: what it shows, and changing their own name and
// password from it.
import { beforeAll, describe, expect, it } from "vitest";
import { loadTestPeople } from "../src/test-people.ts";
import {
  ACCOUNTS,
  ADA,
  ADMIN,
  askGateway,
  BOB,
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

const accountPage = async (cookie: string) => {
  const response = await request(accounts, "/", { headers: { cookie } });
  expect(response.status).toBe(200);
  return response.text();
};

describe("the account page", () => {
  it("shows the person's name, email, and their apps with each app's name, icon and level", async () => {
    const html = await accountPage(await signIn(accounts, ADA));
    expect(html).toContain("<h1>Ada Lovelace</h1>");
    expect(html).toContain("ada@example.com");
    expect(html).toContain(
      `<img src="https://notes.${DOMAIN}/icons/icon-192.png" alt="">`,
    );
    expect(html).toContain(
      `<img src="https://encyclopedia.${DOMAIN}/icons/icon-512.png" alt="">`,
    );
    expect(html).toMatch(/Encyclopedia<\/a>\s*<span[^>]*>Member<\/span>/);
    expect(html).toMatch(/Notes<\/a>\s*<span[^>]*>Admin<\/span>/);
    expect(html).not.toContain("<script");
  });

  it("says so when the person has no apps", async () => {
    const html = await accountPage(await signIn(accounts, BOB));
    expect(html).toContain("No apps yet.");
  });

  it("sends a signed-out browser to sign in, and back to the account page", async () => {
    const response = await request(accounts, "/");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      `${ACCOUNTS}/sign-in?return-to=${encodeURIComponent(`${ACCOUNTS}/`)}`,
    );
  });
});

describe("admin links", () => {
  it("show a homelab admin the People page", async () => {
    const html = await accountPage(await signIn(accounts, ADMIN));
    expect(html).toContain('<a href="/people">People</a>');
  });

  it("show nobody else anything for admins", async () => {
    const html = await accountPage(await signIn(accounts, ADA));
    expect(html).not.toContain("/people");
  });
});

describe("the People page", () => {
  it("opens for a homelab admin", async () => {
    const cookie = await signIn(accounts, ADMIN);
    const response = await request(accounts, "/people", {
      headers: { cookie },
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<h1>People</h1>");
  });

  it("refuses everyone else", async () => {
    const cookie = await signIn(accounts, ADA);
    const response = await request(accounts, "/people", {
      headers: { cookie },
    });
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain("<h1>People</h1>");
  });

  it("sends a signed-out browser to sign in, and back to it", async () => {
    const response = await request(accounts, "/people");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      `${ACCOUNTS}/sign-in?return-to=${encodeURIComponent(`${ACCOUNTS}/people`)}`,
    );
  });
});

/** Submits one of the account page's forms, as the browser does from that page. */
function submit(
  path: string,
  cookie: string,
  fields: Record<string, string>,
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

describe("changing one's name", () => {
  it("shows the new name on the account page, and in apps on the next request", async () => {
    const dana = {
      email: "dana@example.com",
      password: "quartz-ember-willow-27",
      name: "Dana Scully",
    };
    await loadTestPeople(accounts, [dana]);
    const cookie = await signIn(accounts, dana);
    const response = await submit("/name", cookie, {
      name: "  Dana K. Scully ",
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/?changed=name");
    const html = await (
      await request(accounts, "/?changed=name", { headers: { cookie } })
    ).text();
    expect(html).toContain("<h1>Dana K. Scully</h1>");
    expect(html).toContain('<p role="status">Your name is changed.</p>');
    const gateway = await askGateway(accounts, cookie, `home.${DOMAIN}`);
    expect(gateway.headers.get("remote-name")).toBe("Dana K. Scully");
  });

  it("needs a name", async () => {
    const cookie = await signIn(accounts, ADA);
    const response = await submit("/name", cookie, { name: "   " });
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("Enter a name.");
    expect(await accountPage(cookie)).toContain("<h1>Ada Lovelace</h1>");
  });
});

describe("changing one's password", () => {
  const person = {
    email: "grace@example.com",
    password: "copper-thistle-lantern-65",
    name: "Grace Hopper",
  };
  let cookie = "";

  beforeAll(async () => {
    await loadTestPeople(accounts, [person]);
    cookie = await signIn(accounts, person);
  });

  const change = (current: string, next: string) =>
    submit("/password", cookie, {
      "current-password": current,
      "new-password": next,
    });

  it("needs the current password", async () => {
    const response = await change("not-her-password", "a-new-passphrase");
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("Your current password is wrong.");
    expect((await submitSignIn(accounts, person)).status).toBe(303);
  });

  it("needs a new password of at least 8 characters", async () => {
    const response = await change(person.password, "seven77");
    expect(response.status).toBe(400);
    expect(await response.text()).toContain(
      "Use a new password of at least 8 characters.",
    );
    expect((await submitSignIn(accounts, person)).status).toBe(303);
  });

  it("takes any new password of 8 characters or more, and the old one stops working", async () => {
    const response = await change(person.password, "eight888");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/?changed=password");
    expect(
      await (
        await request(accounts, "/?changed=password", { headers: { cookie } })
      ).text(),
    ).toContain('<p role="status">Your password is changed.</p>');
    expect((await submitSignIn(accounts, person)).status).toBe(401);
    expect(
      (await submitSignIn(accounts, { ...person, password: "eight888" }))
        .status,
    ).toBe(303);
  });
});

describe("the account page's forms", () => {
  it("are refused from another site, whatever they ask", async () => {
    const cookie = await signIn(accounts, ADA);
    const elsewhere: Record<string, string>[] = [
      { "origin": "https://elsewhere.test", "sec-fetch-site": "cross-site" },
      { "origin": `https://notes.${DOMAIN}`, "sec-fetch-site": "same-site" },
      { "origin": ACCOUNTS, "sec-fetch-site": "cross-site" },
      { origin: "null" },
    ];
    for (const headers of elsewhere) {
      for (const [path, fields] of [
        ["/name", { name: "Mallory" }],
        [
          "/password",
          {
            "current-password": ADA.password,
            "new-password": "mallory-was-here",
          },
        ],
      ] as const) {
        const response = await submit(path, cookie, fields, headers);
        expect(response.status, `${path} ${JSON.stringify(headers)}`).toBe(403);
      }
    }
    expect(await accountPage(cookie)).toContain("<h1>Ada Lovelace</h1>");
    expect((await submitSignIn(accounts, ADA)).status).toBe(303);
  });

  it("send a signed-out browser to sign in, and back to the account page", async () => {
    const response = await submit("/name", "", { name: "Nobody" });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      `${ACCOUNTS}/sign-in?return-to=${encodeURIComponent(`${ACCOUNTS}/`)}`,
    );
  });
});
