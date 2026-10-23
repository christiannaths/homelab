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
import {
  ADA,
  ADMIN,
  BOB,
  DANA,
  INSTALLED_APPS,
  PEOPLE,
  type TestPerson,
} from "../test-people.ts";

const ROOT = new URL("../..", import.meta.url).pathname;
// The preview workflow builds the image itself and passes it in, so the image tested is the one deployed.
const IMAGE = process.env.PREVIEW_IMAGE ?? "homelab-preview:test";
const CONTAINER = "homelab-preview-test";
const VOLUME = "homelab-preview-test";
const DOMAIN = "pr-1.preview.test";
const ACCOUNTS = `https://accounts.${DOMAIN}`;

let port = 0;

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
  form?: string,
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    request(
      {
        host: "127.0.0.1",
        port,
        method: form === undefined ? "GET" : "POST",
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
      .end(form);
  });
}

let addresses = 0;
/** A new client address each time, so the tests' many sign-ins never reach the rate limit. */
const nextAddress = () => `203.0.113.${(addresses++ % 250) + 1}`;

/**
 * Submits the accounts sign-in page's form as a browser does, through the gateway, from the
 * client address Fly's proxy appends to X-Forwarded-For.
 */
function submitSignIn(
  email: string,
  password: string,
  forwardedFor = nextAddress(),
): Promise<Reply> {
  return get(
    "accounts",
    "/sign-in",
    {
      "origin": ACCOUNTS,
      "content-type": "application/x-www-form-urlencoded",
      "x-forwarded-for": forwardedFor,
    },
    new URLSearchParams({ email, password }).toString(),
  );
}

/**
 * Signs in with the person's email and password, and returns the session cookies set and the
 * cookie header that carries them.
 */
async function signIn(
  person: Pick<TestPerson, "email" | "password">,
): Promise<{ cookie: string; cookies: string[] }> {
  const reply = await submitSignIn(person.email, person.password);
  assert.equal(reply.status, 303, `${person.email} was refused: ${reply.body}`);
  return {
    cookies: reply.cookies,
    cookie: reply.cookies.map((cookie) => cookie.split(";")[0]).join("; "),
  };
}

/** Loads people with the accounts service's loader in the preview, bringing each to what is given. */
function loadPeople(people: Omit<TestPerson, "gets">[]): void {
  execFileSync(
    "docker",
    [
      "exec",
      "--interactive",
      "--env",
      `HOMELAB_DOMAIN=${DOMAIN}`,
      "--env",
      `HOMELAB_APPS=${INSTALLED_APPS}`,
      "--env",
      "DATA_DIR=/data/accounts",
      CONTAINER,
      "node",
      "--no-experimental-webstorage",
      "apps/accounts/server/src/load-test-people.ts",
    ],
    { input: JSON.stringify(people), stdio: ["pipe", "ignore", "inherit"] },
  );
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
  return reply.status === 200 ? "in" : String(reply.status);
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
    // Unref'd, or the test process waits out the 20 s after the last test passes.
    setTimeout(() => reject(new Error("no sync in 20 s")), 20_000).unref();
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
  if (!process.env.PREVIEW_IMAGE)
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
    "ACCOUNTS_SECRET=preview-test-accounts-secret-0123456789abcdef",
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
  test("each test person signs in by email and gets what their App access gives them", async () => {
    const ada = await signIn(ADA);
    assert.equal(await notesSession(ada.cookie), "owner");
    assert.equal(await encyclopedia(ada.cookie), "in");

    const dana = await signIn(DANA);
    assert.equal(await notesSession(dana.cookie), "member");
    assert.equal(await encyclopedia(dana.cookie), "403");

    const bob = await signIn(BOB);
    assert.match(await notesSession(bob.cookie), /^403 /);
    assert.equal(await encyclopedia(bob.cookie), "403");

    const admin = await signIn(ADMIN);
    assert.equal(await notesSession(admin.cookie), "owner");
    assert.equal(await encyclopedia(admin.cookie), "in");
  });

  test("a wrong password is refused", async () => {
    assert.equal((await submitSignIn(ADA.email, BOB.password)).status, 401);
  });

  test("attempts are limited per client address, which a browser can't choose", async () => {
    const statuses = [];
    // Fly's proxy appends the address it saw; whatever the browser sent comes before it.
    for (let i = 0; i < 6; i++)
      statuses.push(
        (
          await submitSignIn(
            ADA.email,
            BOB.password,
            `198.51.100.${i + 1}, 192.0.2.77`,
          )
        ).status,
      );
    assert.deepEqual(statuses, [401, 401, 401, 401, 401, 429]);
    assert.equal(
      (await submitSignIn(ADA.email, ADA.password, "192.0.2.78")).status,
      303,
    );
  });

  test("Home lists each person's apps, from their manifests, to every account", async () => {
    const apps = async (person: TestPerson) => {
      const reply = await get("home", "/api/me", {
        cookie: (await signIn(person)).cookie,
      });
      assert.equal(reply.status, 200, `${person.email}: ${reply.body}`);
      const listed = pick(reply.body, "apps");
      assert.ok(Array.isArray(listed), reply.body);
      return listed.map((app) => pick(JSON.stringify(app), "name"));
    };
    assert.deepEqual(await apps(ADA), ["Encyclopedia", "Home", "Notes"]);
    assert.deepEqual(await apps(DANA), ["Home", "Notes"]);
    assert.deepEqual(await apps(BOB), ["Home"]);
    assert.deepEqual(await apps(ADMIN), ["Encyclopedia", "Home", "Notes"]);
  });

  test("every app's page has the App switcher in it, from the gateway", async () => {
    const { cookie } = await signIn(ADA);
    for (const site of ["home", "notes", "encyclopedia"]) {
      const reply = await get(site, "/", { cookie });
      assert.equal(reply.status, 200, site);
      assert.match(reply.body, /<script>.*homelab-switcher.*<\/script>/s, site);
    }
  });

  test("the session is scoped to the preview's domain", async () => {
    const { cookies } = await signIn(DANA);
    const session = cookies.find((cookie) =>
      cookie.startsWith("__Secure-homelab.session_token="),
    );
    assert.match(session ?? "", new RegExp(`; domain=${DOMAIN};`, "i"));
  });

  test("has no one-click test sign-in links, which only dev has", async () => {
    const reply = await get(
      "accounts",
      `/test-sign-in?email=${encodeURIComponent(ADA.email)}`,
    );
    assert.equal(reply.status, 404);
    assert.deepEqual(reply.cookies, []);
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
      reply = await get("accounts", "/sign-in").catch(() => undefined);
      if (!reply) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(reply?.status, 200, reply?.body ?? "no answer");
    await waitUntilUp(since);
  });

  test("answers 404 for a site the homelab doesn't have", async () => {
    assert.equal((await get("login", "/")).status, 404);
  });

  test("sends a request with no session to the accounts sign-in page", async () => {
    const reply = await get("notes", "/");
    assert.equal(reply.status, 302);
    assert.match(
      reply.location ?? "",
      new RegExp(`^https://accounts\\.${DOMAIN}/sign-in\\?`),
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
    const ada = await signIn(ADA);
    const adaId = pick(
      (await get("notes", "/api/session", { cookie: ada.cookie })).body,
      "person",
      "id",
    );
    const forged = {
      "remote-user": String(adaId),
      "remote-groups": "notes-admins",
      "remote-name": ADA.name,
      "remote-email": ADA.email,
    };
    const signedOut = await get("notes", "/api/session", forged);
    assert.equal(signedOut.status, 302);

    const dana = await signIn(DANA);
    const reply = await get("notes", "/api/session", {
      ...forged,
      cookie: dana.cookie,
    });
    assert.notEqual(pick(reply.body, "person", "id"), adaId);
    assert.equal(pick(reply.body, "person", "name"), DANA.name);
    assert.equal(pick(reply.body, "person", "role"), "member");
  });
});

describe("data", () => {
  test("accounts, sessions and Notes survive a restart on the same volume", async () => {
    const ada = await signIn(ADA);
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
    assert.equal(await notesSession((await signIn(DANA)).cookie), "member");
  });

  test("a later start adds only the test people missing, keeping changes to the others", async () => {
    const { gets: _, ...bob } = BOB;
    loadPeople([{ ...bob, password: "a-password-bob-chose-later" }]);

    await restart();

    assert.equal((await submitSignIn(BOB.email, BOB.password)).status, 401);
    await signIn({ email: BOB.email, password: "a-password-bob-chose-later" });
    for (const person of [ADMIN, ADA, DANA]) await signIn(person);
  });

  test("a preview from before the accounts service starts fresh", async () => {
    const ada = await signIn(ADA);
    const written = await openDocument(ada.cookie, "preview-test-cutover");
    written.text.insert(0, "from before the cutover");
    await new Promise((resolve) => setTimeout(resolve, 2000));
    written.close();
    // A volume as the previews had it: no accounts data, and Notes data from other accounts.
    docker("exec", CONTAINER, "rm", "-r", "/data/accounts");

    await restart();

    const fresh = await signIn(ADA);
    const reread = await openDocument(fresh.cookie, "preview-test-cutover");
    assert.equal(reread.text.toString(), "");
    reread.close();
  });

  test("reset leaves only the test people, as published, and no Notes data", async () => {
    loadPeople([
      {
        email: "eve@example.com",
        password: "eve-was-added-in-the-preview",
        name: "Eve",
        apps: { notes: "member" },
      },
      { ...DANA, password: "a-password-dana-chose-later" },
    ]);
    await signIn({
      email: "eve@example.com",
      password: "eve-was-added-in-the-preview",
    });
    const ada = await signIn(ADA);
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
    const fresh = await signIn(ADA);
    assert.equal(await notesSession(fresh.cookie), "owner");
    const reread = await openDocument(fresh.cookie, "preview-test-reset");
    assert.equal(reread.text.toString(), "");
    reread.close();
    assert.equal(
      (await submitSignIn("eve@example.com", "eve-was-added-in-the-preview"))
        .status,
      401,
    );
    for (const person of PEOPLE) await signIn(person);
  });
});
