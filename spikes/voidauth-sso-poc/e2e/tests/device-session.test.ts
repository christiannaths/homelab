// Question 5: the app's own device session on top of VoidAuth, and VoidAuth going down after sign-in.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { newPerson, startApp } from "./app.ts";
import { ADMIN_PASSWORD } from "./global-setup.ts";
import { Person, syncOnce } from "./person.ts";
import { APP_URL, compose, VOIDAUTH_URL, waitForVoidAuth } from "./voidauth.ts";

const env = inject("composeEnv");
let app: Awaited<ReturnType<typeof startApp>>;
const owner = new Person();
const member = new Person();
const who = newPerson("dev");

beforeAll(async () => {
  app = await startApp();
  await owner.signInToApp("auth_admin", ADMIN_PASSWORD);
  const { appLink } = (await (await owner.app("POST", "/api/invites", { email: null })).json()) as { appLink: string };
  expect((await member.registerDuringAppSignIn({ ...who, name: "Device" }, new URL(appLink).pathname)).status).toBe(302);
});
afterAll(async () => {
  await compose(env, "start", "voidauth");
  await waitForVoidAuth();
  await app.close();
});

describe("the app's device session", () => {
  it("sets its own HttpOnly, Secure, SameSite=Lax cookie that the sync WebSocket accepts", async () => {
    expect(member.jar.get(APP_URL, "notes_device")).toBeDefined();
    const { ws, hello } = await member.openSync();
    expect(hello.sub).toBe([...app.members.values()].find((m) => m.email === who.email)!.sub);
    expect(await syncOnce(ws, "edit")).toEqual({ type: "synced", echo: "edit" });
    ws.close();
  });

  it("refuses the WebSocket without the cookie", async () => {
    await expect(new Person().openSync()).rejects.toThrow("sync refused: 401");
  });
});

describe("with VoidAuth stopped after sign-in", () => {
  beforeAll(async () => {
    await compose(env, "stop", "voidauth");
    await expect(fetch(`${VOIDAUTH_URL}/oidc/.well-known/openid-configuration`)).rejects.toThrow();
  });

  it("keeps the app working: the cookie still opens the WebSocket and syncs go through", async () => {
    expect((await member.app("GET", "/api/me")).status).toBe(200);
    const { ws } = await member.openSync();
    expect(await syncOnce(ws, "offline-of-voidauth")).toMatchObject({ type: "synced" });
    ws.close();
  });

  it("cannot sign anyone new in until VoidAuth is back", async () => {
    await expect(new Person().signInToApp(who.email, who.password)).rejects.toThrow();
  });

  it("signs people in again once VoidAuth is back, keeping VoidAuth's own sessions", async () => {
    await compose(env, "start", "voidauth");
    await waitForVoidAuth();
    // The member's VoidAuth session survived the restart: no password needed.
    expect((await member.startAppSignIn()).pathname).toBe("/");
    expect((await new Person().signInToApp(who.email, who.password)).status).toBe(302);
  });
});
