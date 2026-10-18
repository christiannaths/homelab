// Notes signing people in through the real VoidAuth image, with registration closed (ADR-PLAT-004).
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  HocuspocusProvider,
  HocuspocusProviderWebsocket,
} from "@hocuspocus/provider";
import { startServer, type NotesServer } from "@homelab/notes-server";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { WebSocket } from "ws";
import * as Y from "yjs";
import { Browser } from "./browser.ts";
import {
  ADMIN_PASSWORD,
  ADMIN_USERNAME,
  compose,
  NOTES_CLIENT_SECRET,
  NOTES_PORT,
  NOTES_URL,
  VOIDAUTH_URL,
  waitForVoidAuth,
} from "./voidauth.ts";

let notes: NotesServer;
const owner = new Browser();

beforeAll(async () => {
  notes = await startServer({
    dataDir: mkdtempSync(path.join(tmpdir(), "notes-e2e-")),
    port: NOTES_PORT,
    publicUrl: NOTES_URL,
    oidc: {
      issuer: `${VOIDAUTH_URL}/oidc`,
      clientId: "notes",
      clientSecret: NOTES_CLIENT_SECRET,
    },
  });
});
afterAll(() => notes.close());

/** Opens one page over the sync socket with a browser's Notes cookie, and resolves once it has synced. */
function openPage(browser: Browser, name: string) {
  const cookie = browser.notesCookie;
  const socket = new HocuspocusProviderWebsocket({
    url: `${NOTES_URL.replace("http", "ws")}/sync`,
    WebSocketPolyfill: class extends WebSocket {
      constructor(url: string, protocols?: string | string[]) {
        super(url, protocols, { headers: { cookie } });
      }
    },
    maxAttempts: 1,
  });
  const doc = new Y.Doc();
  const synced = new Promise<void>((resolve, reject) => {
    const provider = new HocuspocusProvider({
      websocketProvider: socket,
      name,
      document: doc,
      token: "cookie",
      onSynced: () => resolve(),
      onAuthenticationFailed: ({ reason }) => reject(new Error(reason)),
    });
    provider.attach();
  });
  return { doc, synced, close: () => socket.destroy() };
}

let counter = 0;
function newAccount(prefix: string) {
  counter += 1;
  const username = `${prefix}_${process.pid}_${counter}`;
  return { username, password: `amber-${username}-lighthouse-93` };
}

describe("the instance admin", () => {
  it("signs in through VoidAuth, becomes the Notes owner, and syncs a page", async () => {
    expect(await owner.signInToNotes(ADMIN_USERNAME, ADMIN_PASSWORD)).toEqual({
      status: 302,
      body: "/",
    });
    const session: unknown = await (
      await owner.notes("GET", "/api/session")
    ).json();
    expect(session).toMatchObject({ person: { role: "owner" } });

    const page = openPage(owner, "pages/welcome");
    await page.synced;
    page.doc.getText("body").insert(0, "hello");
    page.close();
  });

  it("signs in on a second device without typing the password again", async () => {
    // The same browser is still signed in to VoidAuth, so VoidAuth sends it straight back.
    expect(await owner.signInToNotes()).toEqual({ status: 302, body: "/" });
  });
});

describe("closed registration", () => {
  it("refuses to create an account on VoidAuth's page without an invite", async () => {
    const stranger = new Browser();
    await stranger.jar.follow(
      `${NOTES_URL}/api/sign-in`,
      (l) => l.origin === VOIDAUTH_URL && l.pathname === "/login",
    );
    const response = await stranger.register(newAccount("stranger"));
    expect(response.ok).toBe(false);
  });

  it("creates an account from a VoidAuth invite link, which Notes alone does not admit", async () => {
    const admin = new Browser();
    await admin.signInToVoidAuth(ADMIN_USERNAME, ADMIN_PASSWORD);
    const link = await admin.createInvite();

    const invitee = new Browser();
    const account = newAccount("invitee");
    expect((await invitee.acceptInvite(link, account)).status).toBe(200);
    // A VoidAuth account grants nothing in Notes until Notes' own invites exist (issue #42).
    const result = await invitee.signInToNotes(
      account.username,
      account.password,
    );
    expect(result).toEqual({ status: 302, body: "/no-access" });

    // The link works once.
    const again = await new Browser().acceptInvite(link, newAccount("reuse"));
    expect(again.ok).toBe(false);
  });
});

describe("with VoidAuth stopped", () => {
  it("a signed-in device keeps syncing", async () => {
    const env = inject("composeEnv");
    await compose(env, "stop", "voidauth");
    try {
      const page = openPage(owner, "pages/welcome");
      await page.synced;
      page.close();
      expect((await owner.notes("GET", "/api/session")).status).toBe(200);
    } finally {
      await compose(env, "start", "voidauth");
      await waitForVoidAuth();
    }
  });
});
