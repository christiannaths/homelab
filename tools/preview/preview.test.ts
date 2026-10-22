// Drives the preview image from outside, as Fly's proxy and a browser would: one container, one
// volume, a made-up preview domain, plain HTTP with the Host header and X-Forwarded-Proto Fly sets.
// Needs Docker; run with `npm run e2e -w @homelab/tools`.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { request } from "node:http";
import { after, before, describe, test } from "node:test";
import {
  HocuspocusProvider,
  HocuspocusProviderWebsocket,
} from "@hocuspocus/provider";
import { WebSocket } from "ws";
import * as Y from "yjs";
import { VoidAuthClient } from "@homelab/voidauth-fixtures";
import { ADMIN, PEOPLE } from "./fixtures.ts";

const ROOT = new URL("../..", import.meta.url).pathname;
const IMAGE = "homelab-preview:test";
const CONTAINER = "homelab-preview-test";
const VOLUME = "homelab-preview-test";
const DOMAIN = "pr-1.preview.test";

let port = 0;

const byName = (a: unknown, b: unknown) => String(a).localeCompare(String(b));

/** The value at `keys` in a JSON body, or undefined where the body has another shape. */
function pick(text: string, ...keys: string[]): unknown {
  let value: unknown = JSON.parse(text);
  for (const key of keys)
    value =
      typeof value === "object" && value !== null
        ? new Map(Object.entries(value)).get(key)
        : undefined;
  return value;
}

function docker(...args: string[]): string {
  return execFileSync("docker", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

/** Waits until the preview has loaded its test accounts since `since` (a Docker log time). */
async function waitUntilUp(since: string): Promise<void> {
  for (let i = 0; i < 240; i++) {
    const log = execFileSync("docker", ["logs", "--since", since, CONTAINER], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (log.includes("The preview is up")) return;
    if (log.includes("stops too") || log.includes("Resetting failed"))
      throw new Error(`The preview failed to start:\n${log}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("The preview did not start within 2 minutes");
}

interface Reply {
  status: number;
  location: string | undefined;
  cookies: string[];
  body: string;
}

/** A request to one of the preview's sites, as it arrives from Fly's proxy. */
function get(
  site: string,
  route: string,
  headers: Record<string, string> = {},
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    request(
      {
        host: "127.0.0.1",
        port,
        // A fresh connection each time, since a restart or reset closes the gateway's.
        agent: false,
        path: route,
        headers: {
          "host": `${site}.${DOMAIN}`,
          "x-forwarded-proto": "https",
          ...headers,
        },
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => (body += chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            location: res.headers.location,
            cookies: res.headers["set-cookie"] ?? [],
            body,
          }),
        );
      },
    )
      .on("error", reject)
      .end();
  });
}

/**
 * Signs in on VoidAuth's sign-in page as a browser does, through the gateway, and returns the
 * session cookies it sets and the cookie header that carries them.
 */
async function signIn(username: string): Promise<{
  cookie: string;
  cookies: string[];
}> {
  const account = [ADMIN, ...PEOPLE].find(
    (candidate) => candidate.username === username,
  );
  assert.ok(account, `no test account ${username}`);
  const browser = new VoidAuthClient({
    url: `https://accounts.${DOMAIN}`,
    port,
  });
  assert.ok(await browser.signIn(account), `VoidAuth refused ${username}`);
  const cookies = browser.sessionCookies();
  return {
    cookies,
    cookie: cookies.map((cookie) => cookie.split(";")[0]).join("; "),
  };
}

/** Notes' view of who is signed in, or where the gateway sent the request instead. */
async function notesSession(cookie: string): Promise<string> {
  const reply = await get("notes", "/api/session", { cookie });
  if (reply.status !== 200) return `${reply.status} ${reply.location}`;
  return String(pick(reply.body, "person", "role"));
}

/** Whether the Encyclopedia lets the cookie's person in. */
async function encyclopedia(cookie: string): Promise<string> {
  const reply = await get("encyclopedia", "/", { cookie });
  return reply.status === 200
    ? "in"
    : new URL(reply.location ?? "", "https://x").pathname;
}

/** Opens a Notes document over the sync socket, through the gateway, as the cookie's person. */
async function openDocument(cookie: string, name: string) {
  const headers = {
    "host": `notes.${DOMAIN}`,
    "x-forwarded-proto": "https",
    cookie,
  };
  const socket = new HocuspocusProviderWebsocket({
    url: `ws://127.0.0.1:${port}/sync`,
    WebSocketPolyfill: class extends WebSocket {
      constructor(url: string, protocols?: string | string[]) {
        super(url, protocols, { headers });
      }
    },
    maxAttempts: 1,
  });
  const doc = new Y.Doc();
  const provider = new HocuspocusProvider({
    websocketProvider: socket,
    name,
    document: doc,
    token: "gateway",
  });
  provider.attach();
  await new Promise<void>((resolve, reject) => {
    provider.on("synced", () => resolve());
    provider.on("authenticationFailed", () => reject(new Error("denied")));
    setTimeout(() => reject(new Error("no sync in 20 s")), 20_000);
  });
  return {
    text: doc.getText("body"),
    close: () => {
      provider.destroy();
      socket.destroy();
    },
  };
}

/** Restarts the container on the same volume, as Fly does when a stopped machine wakes. */
async function restart(): Promise<void> {
  const since = new Date().toISOString();
  docker("restart", CONTAINER);
  port = Number(docker("port", CONTAINER, "8080").split(":").at(-1));
  await waitUntilUp(since);
}

before(async () => {
  // Behind a proxy that intercepts TLS, as in a cloud environment, npm in the build needs its CA.
  const ca = process.env.NODE_EXTRA_CA_CERTS;
  docker(
    "build",
    "--quiet",
    ...(ca ? ["--secret", `id=ca-certs,src=${ca}`] : []),
    "-f",
    "tools/preview/Dockerfile",
    "-t",
    IMAGE,
    ".",
  );
  execFileSync("docker", ["rm", "--force", "--volumes", CONTAINER], {
    stdio: "ignore",
  });
  execFileSync("docker", ["volume", "rm", "--force", VOLUME], {
    stdio: "ignore",
  });
  const since = new Date().toISOString();
  docker(
    "run",
    "--detach",
    "--name",
    CONTAINER,
    "--publish",
    "127.0.0.1::8080",
    "--volume",
    `${VOLUME}:/data`,
    "--env",
    "PREVIEW_NAME=pr-1",
    "--env",
    "PREVIEW_DOMAIN=preview.test",
    "--env",
    "STORAGE_KEY=preview-test-storage-key-0123456789abcdef",
    IMAGE,
  );
  port = Number(docker("port", CONTAINER, "8080").split(":").at(-1));
  await waitUntilUp(since);
});

after(() => {
  if (process.env.KEEP_PREVIEW) return;
  execFileSync("docker", ["rm", "--force", "--volumes", CONTAINER], {
    stdio: "ignore",
  });
  execFileSync("docker", ["volume", "rm", "--force", VOLUME], {
    stdio: "ignore",
  });
});

describe("signing in", () => {
  test("each account gets what its groups give it", async () => {
    const ada = await signIn("ada");
    assert.equal(await notesSession(ada.cookie), "owner");
    assert.equal(await encyclopedia(ada.cookie), "in");

    const dana = await signIn("dana");
    assert.equal(await notesSession(dana.cookie), "member");
    assert.equal(await encyclopedia(dana.cookie), "/forbidden");

    const bob = await signIn("bob");
    assert.match(await notesSession(bob.cookie), /^302 .*\/forbidden/);
    assert.equal(await encyclopedia(bob.cookie), "/forbidden");

    const admin = await signIn(ADMIN.username);
    assert.equal(await notesSession(admin.cookie), "owner");
    assert.equal(await encyclopedia(admin.cookie), "in");
  });

  test("Home lists each account's apps, from their manifests, to every account", async () => {
    const apps = async (username: string) => {
      const reply = await get("home", "/api/me", {
        cookie: (await signIn(username)).cookie,
      });
      assert.equal(reply.status, 200, `${username}: ${reply.body}`);
      const listed = pick(reply.body, "apps");
      assert.ok(Array.isArray(listed), reply.body);
      return listed.map((app) => pick(JSON.stringify(app), "name"));
    };
    assert.deepEqual(await apps("ada"), ["Encyclopedia", "Home", "Notes"]);
    assert.deepEqual(await apps("dana"), ["Home", "Notes"]);
    assert.deepEqual(await apps("bob"), ["Home"]);
    assert.deepEqual(await apps(ADMIN.username), [
      "Encyclopedia",
      "Home",
      "Notes",
    ]);
  });

  test("every app's page loads the App switcher from Home", async () => {
    const { cookie } = await signIn("ada");
    for (const site of ["home", "notes", "encyclopedia"]) {
      const reply = await get(site, "/_homelab/switcher.js", { cookie });
      assert.equal(reply.status, 302, site);
      assert.equal(reply.location, `https://home.${DOMAIN}/switcher.js`, site);
    }
    const script = await get("home", "/switcher.js", { cookie });
    assert.equal(script.status, 200);
    assert.match(script.body, /homelab-switcher/);
  });

  test("VoidAuth's session is scoped to the preview's domain", async () => {
    const { cookies } = await signIn("dana");
    const session = cookies.find((cookie) =>
      cookie.startsWith("x-voidauth-session="),
    );
    assert.match(session ?? "", new RegExp(`; domain=${DOMAIN};`, "i"));
  });
});

describe("the gateway", () => {
  test("holds a request made while the preview starts until it can answer", async () => {
    const since = new Date().toISOString();
    docker("restart", CONTAINER);
    port = Number(docker("port", CONTAINER, "8080").split(":").at(-1));
    // Docker accepts and drops connections until the gateway listens; the first answer counts.
    let reply: Reply | undefined;
    for (let i = 0; i < 300 && !reply; i++) {
      reply = await get("accounts", "/api/public/config").catch(
        () => undefined,
      );
      if (!reply) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(reply?.status, 200, reply?.body ?? "no answer");
    await waitUntilUp(since);
  });

  test("answers 404 for a site the homelab doesn't have", async () => {
    assert.equal((await get("login", "/")).status, 404);
  });

  test("sends a request with no session to VoidAuth's sign-in", async () => {
    const reply = await get("notes", "/");
    assert.equal(reply.status, 302);
    assert.match(
      reply.location ?? "",
      new RegExp(`^https://accounts\\.${DOMAIN}/`),
    );
  });

  test("lets anyone read each app's manifest and its icons, and nothing else", async () => {
    for (const site of ["notes", "encyclopedia"]) {
      const manifest = await get(site, "/manifest.webmanifest");
      assert.equal(manifest.status, 200, site);
      assert.equal(pick(manifest.body, "homelab", "opens_offline"), true, site);
      const icons = pick(manifest.body, "icons");
      assert.ok(Array.isArray(icons) && icons.length > 0, manifest.body);
      for (const icon of icons) {
        const src = String(pick(JSON.stringify(icon), "src"));
        assert.equal((await get(site, `/${src}`)).status, 200, src);
      }
      for (const route of ["/", "/index.html", "/sw.js", "/icons/../"])
        assert.equal((await get(site, route)).status, 302, `${site} ${route}`);
    }
  });

  test("ignores Remote-* headers sent by the client", async () => {
    const forged = {
      "remote-user": "ada",
      "remote-groups": "notes-admins",
      "remote-name": "Ada Lovelace",
    };
    const signedOut = await get("notes", "/api/session", forged);
    assert.equal(signedOut.status, 302);

    const dana = await signIn("dana");
    assert.equal(
      await notesSession(dana.cookie),
      "member",
      "dana stays a member",
    );
    const reply = await get("notes", "/api/session", {
      ...forged,
      cookie: dana.cookie,
    });
    assert.equal(pick(reply.body, "person", "id"), "dana");
    assert.equal(pick(reply.body, "person", "role"), "member");
  });
});

describe("data", () => {
  test("accounts, sessions and Notes survive a restart on the same volume", async () => {
    const ada = await signIn("ada");
    const written = await openDocument(ada.cookie, "preview-test");
    written.text.insert(0, "kept across restarts");
    // Notes writes a changed document after a second's debounce, and on shutdown.
    await new Promise((resolve) => setTimeout(resolve, 2000));
    written.close();

    await restart();

    assert.equal(await notesSession(ada.cookie), "owner", "still signed in");
    const reread = await openDocument(ada.cookie, "preview-test");
    assert.equal(reread.text.toString(), "kept across restarts");
    reread.close();
    assert.equal(await notesSession((await signIn("dana")).cookie), "member");
  });

  test("reset leaves only the test accounts and no Notes data", async () => {
    const ada = await signIn("ada");
    const written = await openDocument(ada.cookie, "preview-test-reset");
    written.text.insert(0, "gone after a reset");
    await new Promise((resolve) => setTimeout(resolve, 2000));
    written.close();

    docker("exec", CONTAINER, "node", "tools/preview/start.ts", "reset");

    assert.match(
      await notesSession(ada.cookie),
      /^302 https:\/\/accounts\./,
      "the old session is gone",
    );
    const fresh = await signIn("ada");
    assert.equal(await notesSession(fresh.cookie), "owner");
    const reread = await openDocument(fresh.cookie, "preview-test-reset");
    assert.equal(reread.text.toString(), "");
    reread.close();
    const admin = await signIn(ADMIN.username);
    const users = await get(
      "accounts",
      "/api/admin/users?page=0&pageSize=1000",
      {
        cookie: admin.cookie,
      },
    );
    const listed = pick(users.body, "users");
    assert.ok(Array.isArray(listed), users.body);
    assert.deepEqual(
      listed
        .map((user) => pick(JSON.stringify(user), "username"))
        .toSorted(byName),
      [ADMIN, ...PEOPLE].map((account) => account.username).toSorted(byName),
    );
  });
});
