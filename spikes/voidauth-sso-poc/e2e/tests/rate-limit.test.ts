// Behind a reverse proxy: does VoidAuth's per-address limit still tell people apart, and can a
// client forge its address? Runs its own VoidAuth (rate-limit.compose.yaml) allowing 5 sign-in
// attempts a minute per address, and a small proxy in this process. Each client and the proxy
// connect from their own loopback address, so VoidAuth sees real, distinct addresses.
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, request, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { composeWith } from "./voidauth.ts";

const composeFile = fileURLToPath(
  new URL("../rate-limit.compose.yaml", import.meta.url),
);
const VOIDAUTH_PORT = 3320;
const PROXY_PORT = 3321;
const PROXY_ADDRESS = "127.0.0.10";
const LIMIT = 5;

let env: Record<string, string>;
let dataDir: string;

async function startVoidAuth(trustedProxies: string) {
  env = {
    VOIDAUTH_DATA: dataDir,
    STORAGE_KEY: randomBytes(24).toString("hex"),
    TRUSTED_PROXIES: trustedProxies,
  };
  await composeWith(
    composeFile,
    env,
    "up",
    "--detach",
    "--wait",
    "--force-recreate",
  );
}

/** One sign-in attempt (a POST, so it counts against the limit) from `from`; returns the HTTP status. */
function attempt(
  port: number,
  from: string,
  headers: Record<string, string> = {},
): Promise<number> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ input: "auth_admin", password: "guess" });
    const req = request(
      {
        host: "127.0.0.1",
        port,
        localAddress: from,
        method: "POST",
        path: "/api/interaction/login",
        headers: { "content-type": "application/json", ...headers },
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode ?? 0));
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

/** Attempts until refused; returns how many got through (capped at LIMIT * 3). */
async function attemptsAllowed(
  port: number,
  from: string,
  headers: () => Record<string, string> = () => ({}),
) {
  for (let i = 0; i < LIMIT * 3; i++) {
    if ((await attempt(port, from, headers())) === 429) return i;
  }
  return LIMIT * 3;
}

const randomAddress = () => `203.0.113.${1 + Math.floor(Math.random() * 250)}`;

// The proxy: like nginx, it either passes the client's address on in X-Forwarded-For or not.
let forwardClientAddress = true;
const proxy: Server = createServer((req, res) => {
  const headers = { ...req.headers };
  if (forwardClientAddress) {
    const prior = req.headers["x-forwarded-for"];
    headers["x-forwarded-for"] = prior
      ? `${String(prior)}, ${req.socket.remoteAddress}`
      : String(req.socket.remoteAddress);
  } else {
    delete headers["x-forwarded-for"];
  }
  const upstream = request(
    {
      host: "127.0.0.1",
      port: VOIDAUTH_PORT,
      localAddress: PROXY_ADDRESS,
      method: req.method,
      path: req.url,
      headers,
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );
  upstream.on("error", () => res.writeHead(502).end());
  req.pipe(upstream);
});

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "voidauth-sso-poc-ratelimit-"));
  await new Promise<void>((resolve) =>
    proxy.listen(PROXY_PORT, "127.0.0.1", resolve),
  );
});
afterAll(async () => {
  proxy.close();
  if (env) await composeWith(composeFile, env, "down", "--volumes");
  await rm(dataDir, { recursive: true, force: true });
});

describe("with VoidAuth's default TRUSTED_PROXIES (loopback, linklocal, uniquelocal)", () => {
  beforeAll(() => startVoidAuth(""), 180_000);

  it("puts everyone in one bucket when the proxy does not pass on the client's address", async () => {
    forwardClientAddress = false;
    expect(await attemptsAllowed(PROXY_PORT, "127.0.0.2")).toBe(LIMIT);
    // A different person, through the same proxy, is now locked out too.
    expect(await attempt(PROXY_PORT, "127.0.0.3")).toBe(429);
  });

  it("tells people apart when the proxy passes on X-Forwarded-For", async () => {
    forwardClientAddress = true;
    expect(await attemptsAllowed(PROXY_PORT, "127.0.0.4")).toBe(LIMIT);
    expect(await attempt(PROXY_PORT, "127.0.0.5")).not.toBe(429);
  });

  it("lets a client on a trusted (private or loopback) address forge X-Forwarded-For and never be limited", async () => {
    forwardClientAddress = true;
    // 127.0.0.6 is loopback, so VoidAuth trusts it as a proxy too and reads the forged address
    // to its left. A home network's 192.168.x.x addresses are trusted the same way.
    const forged = () => ({ "x-forwarded-for": randomAddress() });
    expect(await attemptsAllowed(PROXY_PORT, "127.0.0.6", forged)).toBe(
      LIMIT * 3,
    );
    // Straight to VoidAuth, skipping the proxy, works just as well.
    expect(await attemptsAllowed(VOIDAUTH_PORT, "127.0.0.7", forged)).toBe(
      LIMIT * 3,
    );
  });
});

describe("with TRUSTED_PROXIES set to the proxy's address only", () => {
  beforeAll(() => startVoidAuth(PROXY_ADDRESS), 180_000);

  it("limits a client that forges X-Forwarded-For through the proxy", async () => {
    forwardClientAddress = true;
    expect(
      await attemptsAllowed(PROXY_PORT, "127.0.0.2", () => ({
        "x-forwarded-for": randomAddress(),
      })),
    ).toBe(LIMIT);
    expect(await attempt(PROXY_PORT, "127.0.0.3")).not.toBe(429);
  });

  it("ignores X-Forwarded-For from anyone who skips the proxy", async () => {
    expect(
      await attemptsAllowed(VOIDAUTH_PORT, "127.0.0.4", () => ({
        "x-forwarded-for": randomAddress(),
      })),
    ).toBe(LIMIT);
  });
});
