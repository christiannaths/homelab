// Question 1: can an app's server create one-time invite links, with nobody using VoidAuth's admin screens?
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { newPerson, startApp } from "./app.ts";
import { ADMIN_PASSWORD } from "./global-setup.ts";
import { Person } from "./person.ts";

let app: Awaited<ReturnType<typeof startApp>>;
const owner = new Person();

beforeAll(async () => {
  app = await startApp();
  // The instance admin signs in first and becomes the app's first owner.
  expect((await owner.signInToApp("auth_admin", ADMIN_PASSWORD)).status).toBe(302);
});
afterAll(() => app.close());

describe("through VoidAuth's admin API, for someone with no account yet", () => {
  it("creates a VoidAuth invite from the app's server; the invitee accepts it and is let in by verified email", async () => {
    const invitee = newPerson("inv");
    const created = await owner.app("POST", "/api/invites", { email: invitee.email, createAccount: true });
    expect(created.status).toBe(201);
    const { accountLink } = (await created.json()) as { accountLink: string };
    expect(accountLink).toMatch(/\/invite\?invite=[\w-]+&challenge=[\w-]+$/);

    const person = new Person();
    const accepted = await person.acceptInvite(accountLink, { username: invitee.username, name: "Invited Person", password: invitee.password });
    expect(accepted.status).toBe(200);

    // Accepting the invite signed them in to VoidAuth, so the app's sign-in needs no password.
    expect((await person.startAppSignIn()).pathname).toBe("/");
    const me = (await (await person.app("GET", "/api/me")).json()) as { role: string; email: string; name: string };
    expect(me).toMatchObject({ role: "member", email: invitee.email, name: "Invited Person" });
    const claims = app.lastSignIn.get([...app.members.values()].find((m) => m.email === invitee.email)!.sub)!.idToken;
    expect(claims.email_verified).toBe(true);
  });

  it("uses each VoidAuth invite link once", async () => {
    const invitee = newPerson("once");
    const { accountLink } = (await (await owner.app("POST", "/api/invites", { email: invitee.email, createAccount: true })).json()) as { accountLink: string };
    const details = accountLink.replace(/\/invite\?invite=([\w-]+)&challenge=([\w-]+)$/, "/api/auth/invitation/$1/$2");
    expect((await fetch(details)).status).toBe(200);
    expect((await new Person().acceptInvite(accountLink, { username: invitee.username, password: invitee.password })).status).toBe(200);
    // Gone once used. (With open sign-up a reused link just becomes a plain sign-up, without the invite's verified email.)
    expect((await fetch(details)).status).toBe(404);
  });
});

describe("VoidAuth's admin API cannot be limited to invites", () => {
  it("accepts no credentials but an admin's VoidAuth session cookie", async () => {
    const anonymous = new Person();
    expect((await anonymous.voidauth("GET", "/admin/invitations")).status).toBe(401);

    // The owner's OIDC access token from signing in to the app is not accepted either.
    const ownerSub = [...app.members.values()].find((m) => m.role === "owner")!.sub;
    const { accessToken } = app.lastSignIn.get(ownerSub)!;
    const withToken = await anonymous.voidauth("GET", "/admin/invitations", undefined, { authorization: `Bearer ${accessToken}` });
    expect(withToken.status).toBe(401);
  });

  it("refuses a signed-in person who is not a VoidAuth admin", async () => {
    const plain = newPerson("plain");
    const person = new Person();
    expect((await person.registerDuringAppSignIn({ ...plain, name: "Plain" })).status).toBe(403); // no app invite
    expect((await person.voidauth("POST", "/admin/invitation", { email: "x@example.com" })).status).toBe(403);
  });

  it("lets the same admin session that creates invites also delete people", async () => {
    const victim = newPerson("del");
    const person = new Person();
    await person.registerDuringAppSignIn({ ...victim });
    const admin = new Person();
    await admin.signInToVoidAuth("auth_admin", ADMIN_PASSWORD);
    const { users } = (await (await admin.voidauth("GET", `/admin/users?page=0&pageSize=10&searchTerm=${victim.username}`)).json()) as {
      users: { id: string; username: string }[];
    };
    const id = users.find((u) => u.username === victim.username)!.id;
    expect((await admin.voidauth("DELETE", `/admin/user/${id}`)).status).toBe(200);
  });
});

describe("the app's own one-time links, with VoidAuth's open sign-up (no admin credentials anywhere)", () => {
  it("lets a newcomer create an account during sign-in and join through the app's link", async () => {
    const newcomer = newPerson("new");
    const { appLink } = (await (await owner.app("POST", "/api/invites", { email: newcomer.email })).json()) as { appLink: string };

    const person = new Person();
    const result = await person.registerDuringAppSignIn({ ...newcomer, name: "Newcomer" }, new URL(appLink).pathname);
    expect(result.status).toBe(302);
    const me = (await (await person.app("GET", "/api/me")).json()) as { role: string; name: string };
    expect(me).toMatchObject({ role: "member", name: "Newcomer" });
    // The link is used up.
    expect((await new Person().app("GET", new URL(appLink).pathname)).status).toBe(404);
  });

  it("lets someone who already has an account join through the app's link", async () => {
    const existing = newPerson("old");
    const person = new Person();
    expect((await person.registerDuringAppSignIn({ ...existing })).status).toBe(403); // has an account, not let in yet
    const { appLink } = (await (await owner.app("POST", "/api/invites", { email: null })).json()) as { appLink: string };
    expect((await person.startAppSignIn(new URL(appLink).pathname)).pathname).toBe("/"); // signed in to VoidAuth already
    expect((await person.app("GET", "/api/me")).status).toBe(200);
  });

  it("does not let a self-registered email match an email invite, because it is unverified", async () => {
    const target = newPerson("tgt");
    await owner.app("POST", "/api/invites", { email: target.email });
    const impostor = new Person();
    const result = await impostor.registerDuringAppSignIn({ ...target });
    expect(result.status).toBe(403);
  });

  it("lets anyone take an email address first, which then blocks a VoidAuth invite for it", async () => {
    const target = newPerson("sq");
    await new Person().registerDuringAppSignIn({ ...newPerson("sqx"), email: target.email });
    const { accountLink } = (await (await owner.app("POST", "/api/invites", { email: target.email, createAccount: true })).json()) as { accountLink: string };
    const accepted = await new Person().acceptInvite(accountLink, { username: target.username, password: target.password });
    expect(accepted.status).toBe(409);
    expect(await accepted.json()).toEqual({ message: "Email taken." });
  });

  it("only lets owners create invites", async () => {
    const member = newPerson("mem");
    const { appLink } = (await (await owner.app("POST", "/api/invites", { email: null })).json()) as { appLink: string };
    const person = new Person();
    await person.registerDuringAppSignIn({ ...member }, new URL(appLink).pathname);
    expect((await person.app("POST", "/api/invites", { email: "y@example.com" })).status).toBe(403);
  });
});
