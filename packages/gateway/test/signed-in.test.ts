// The sign-in check (signed-in.caddyfile) in the real Caddy image, in front of a stand-in for
// VoidAuth and an app that echoes what reached it. Needs Docker; run with
// `npm run e2e -w @homelab/gateway`.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer, request, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";

const SNIPPET = new URL("../signed-in.caddyfile", import.meta.url).pathname;
const CONTAINER = "homelab-gateway-test";
const SIGN_IN = "https://accounts.home.test/login";
const FORGED = {
  "remote-user": "mallory",
  "remote-name": "Mallory",
  "remote-email": "mallory@example.com",
  "remote-groups": "notes-admins",
};

let voidauth: Server;
let port = 0;

// Answers as VoidAuth's forward-auth does: the person for a session cookie, else its sign-in page.
// Ada has no name, so the Remote-Name a browser sends must not survive either.
function startVoidAuth(): Promise<number> {
  voidauth = createServer((req, res) => {
    if (req.headers.cookie === "session=ada") {
      res.writeHead(200, { "Remote-User": "ada", "Remote-Groups": "notes" });
    } else {
      res.writeHead(302, { Location: SIGN_IN });
    }
    res.end();
  });
  return new Promise((resolve) =>
    voidauth.listen(0, "0.0.0.0", () => {
      const address = voidauth.address();
      resolve(typeof address === "object" && address ? address.port : 0);
    }),
  );
}

interface Reply {
  status: number;
  location: string | undefined;
  allowOrigin: string | string[] | undefined;
  /** What the app received: the path and the Remote-* headers. */
  seen: unknown;
}

function get(route: string, headers: Record<string, string> = {}) {
  return new Promise<Reply>((resolve, reject) => {
    request(
      {
        host: "127.0.0.1",
        port,
        path: route,
        headers: { host: "app.home.test", ...headers },
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => (body += chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            location: res.headers.location,
            allowOrigin: res.headers["access-control-allow-origin"],
            seen: res.statusCode === 200 ? JSON.parse(body) : undefined,
          }),
        );
      },
    )
      .on("error", reject)
      .end();
  });
}

before(async () => {
  const voidauthPort = await startVoidAuth();
  const dir = mkdtempSync(path.join(tmpdir(), "gateway-test-"));
  writeFileSync(
    path.join(dir, "Caddyfile"),
    `{
	auto_https off
	admin off
}

http://app.home.test {
	route {
		import /etc/caddy/signed-in.caddyfile
		header Content-Type application/json
		respond \`{"path": "{http.request.uri.path}", "user": "{http.request.header.Remote-User}", "name": "{http.request.header.Remote-Name}", "email": "{http.request.header.Remote-Email}", "groups": "{http.request.header.Remote-Groups}"}\`
	}
}
`,
  );
  execFileSync("docker", ["rm", "--force", CONTAINER], { stdio: "ignore" });
  execFileSync(
    "docker",
    [
      "run",
      "--detach",
      "--name",
      CONTAINER,
      "--publish",
      "127.0.0.1::80",
      "--add-host",
      "host.docker.internal:host-gateway",
      "--env",
      `VOIDAUTH_UPSTREAM=host.docker.internal:${voidauthPort}`,
      "--volume",
      `${dir}/Caddyfile:/etc/caddy/Caddyfile:ro`,
      "--volume",
      `${SNIPPET}:/etc/caddy/signed-in.caddyfile:ro`,
      // The version tools/dev/compose.yaml runs.
      "caddy:2.10.2@sha256:c3d7ee5d2b11f9dc54f947f68a734c84e9c9666c92c88a7f30b9cba5da182adb",
    ],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
  port = Number(
    execFileSync("docker", ["port", CONTAINER, "80"], { encoding: "utf8" })
      .split(":")
      .at(-1),
  );
  for (let i = 0; i < 100; i++) {
    if (await get("/manifest.webmanifest").catch(() => undefined)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Caddy did not start within 10 seconds");
});

after(() => {
  execFileSync("docker", ["rm", "--force", CONTAINER], { stdio: "ignore" });
  voidauth?.close();
});

describe("signed in", () => {
  test("passes VoidAuth's person on, and none of the browser's headers", async () => {
    const reply = await get("/", { ...FORGED, cookie: "session=ada" });
    assert.deepEqual(reply.seen, {
      path: "/",
      user: "ada",
      name: "",
      email: "",
      groups: "notes",
    });
  });
});

describe("the App switcher's script", () => {
  test("is sent on to Home beside the app, once signed in", async () => {
    const reply = await get("/_homelab/switcher.js", { cookie: "session=ada" });
    assert.equal(reply.status, 302);
    assert.equal(reply.location, "https://home.home.test/switcher.js");
  });

  test("keeps the port the browser used", async () => {
    const reply = await get("/_homelab/switcher.js", {
      cookie: "session=ada",
      host: "app.home.test:8443",
    });
    assert.equal(reply.location, "https://home.home.test:8443/switcher.js");
  });

  test("goes to sign in first when signed out", async () => {
    assert.equal((await get("/_homelab/switcher.js")).location, SIGN_IN);
  });
});

describe("signed out", () => {
  test("lets an app's manifest and icons through, with no Remote-* headers", async () => {
    for (const route of [
      "/manifest.webmanifest",
      "/icons/icon-192.png",
      "/icons/icon.svg",
    ]) {
      const reply = await get(route, FORGED);
      assert.deepEqual(
        reply.seen,
        { path: route, user: "", name: "", email: "", groups: "" },
        route,
      );
    }
  });

  test("lets any page read an icon with CORS, and nothing else", async () => {
    assert.equal((await get("/icons/icon-192.png")).allowOrigin, "*");
    assert.equal((await get("/manifest.webmanifest")).allowOrigin, undefined);
    assert.equal((await get("/")).allowOrigin, undefined);
  });

  test("sends every other path to sign in, including ones that climb out of /icons/", async () => {
    for (const route of [
      "/",
      "/index.html",
      "/sw.js",
      "/api/session",
      "/icons",
      "/icons/../index.html",
      "/icons/%2e%2e/index.html",
      "/icons/..%2findex.html",
      "/manifest.webmanifest/../index.html",
      "/manifest.json",
    ]) {
      const reply = await get(route, FORGED);
      assert.equal(reply.status, 302, route);
      assert.equal(reply.location, SIGN_IN, route);
    }
  });
});
