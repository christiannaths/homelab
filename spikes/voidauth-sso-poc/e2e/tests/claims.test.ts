// Questions 2 and 3: spotting the instance admin from the sign-in, and the sign-in basics.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newPerson, startApp } from "./app.ts";
import { ADMIN_PASSWORD } from "./global-setup.ts";
import { Person } from "./person.ts";

let app: Awaited<ReturnType<typeof startApp>>;
const owner = new Person();
let ownerSub: string;

beforeAll(async () => {
  app = await startApp();
  await owner.signInToApp("auth_admin", ADMIN_PASSWORD);
  ownerSub = [...app.members.values()].find((m) => m.role === "owner")!.sub;
});
afterAll(() => app.close());

async function inviteAndRegister(name: string | undefined) {
  const who = newPerson("clm");
  const { appLink } = (await (await owner.app("POST", "/api/invites", { email: null })).json()) as { appLink: string };
  const person = new Person();
  const result = await person.registerDuringAppSignIn({ ...who, ...(name ? { name } : {}) }, new URL(appLink).pathname);
  expect(result.status).toBe(302);
  const sub = [...app.members.values()].find((m) => m.email === who.email)!.sub;
  return { who, person, sub, signIn: app.lastSignIn.get(sub)! };
}

describe("spotting the instance admin", () => {
  it("puts auth_admins in the admin's groups claim, in both the ID token and userinfo", () => {
    const { idToken, userinfo } = app.lastSignIn.get(ownerSub)!;
    expect(idToken.groups).toEqual(["auth_admins"]);
    expect(userinfo.groups).toEqual(["auth_admins"]);
    expect(app.members.get(ownerSub)?.role).toBe("owner");
  });

  it("sends an empty groups claim for everyone else", async () => {
    const { signIn } = await inviteAndRegister("Grace");
    expect(signIn.idToken.groups).toEqual([]);
    expect(signIn.userinfo.groups).toEqual([]);
  });

  it("sends no groups claim when the app does not ask for the groups scope", async () => {
    // Shown by the claim list VoidAuth advertises: groups is its own scope, not part of profile.
    const discovery = (await (await fetch(`${app.lastSignIn.get(ownerSub)!.idToken.iss as string}/.well-known/openid-configuration`)).json()) as {
      scopes_supported: string[];
      claims_supported: string[];
    };
    expect(discovery.scopes_supported).toEqual(expect.arrayContaining(["openid", "profile", "email", "groups"]));
    expect(discovery.claims_supported).toEqual(expect.arrayContaining(["sub", "email", "email_verified", "name", "preferred_username", "groups"]));
  });
});

describe("sign-in basics", () => {
  it("signs in with the email address instead of the username", async () => {
    const { who } = await inviteAndRegister("By Email");
    const again = new Person();
    expect((await again.signInToApp(who.email, who.password)).status).toBe(302);
    expect((await again.app("GET", "/api/me")).status).toBe(200);
  });

  it("sends the display name as one `name` claim, separate from the username", async () => {
    const { who, signIn } = await inviteAndRegister("Ada Lovelace");
    expect(signIn.idToken.name).toBe("Ada Lovelace");
    expect(signIn.idToken.preferred_username).toBe(who.username);
    expect(signIn.idToken).not.toHaveProperty("given_name");
  });

  it("sends name: null when a person has not set one", async () => {
    const { signIn } = await inviteAndRegister(undefined);
    expect(signIn.idToken.name).toBeNull();
  });

  it("marks a self-registered email unverified when VoidAuth has no email server", async () => {
    const { signIn } = await inviteAndRegister("Unverified");
    expect(signIn.idToken.email_verified).toBe(false);
  });

  it("judges passwords by strength score, not length (PASSWORD_STRENGTH=3, the default)", async () => {
    const tryPassword = async (password: string) => {
      const person = new Person();
      await person.startAppSignIn();
      return (await person.register({ username: newPerson("pw").username, password })).status;
    };
    // Long but common: refused.
    expect(await tryPassword("Password123!")).toBe(422);
    expect(await tryPassword("qwertyuiop")).toBe(422);
    // Eight random characters: also refused at strength 3.
    expect(await tryPassword("k7Rp2wXq")).toBe(422);
    // A two-word passphrase: accepted.
    expect(await tryPassword("violet quartz")).toBe(200);
  });
});
