// Home's server serving its PWA: the web client's files, with caching that lets updates reach
// devices, and the page load that a signed-out browser takes to the gateway's sign-in.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, test } from "vitest";
import { startServer, type HomeServer } from "../src/server.ts";

/** A stand-in for the web client's build, as Vite and its PWA plugin lay it out. */
let clientDir: string;
beforeAll(() => {
  clientDir = mkdtempSync(path.join(tmpdir(), "home-web-"));
  mkdirSync(path.join(clientDir, "assets"));
  writeFileSync(path.join(clientDir, "index.html"), "<!doctype html>Home");
  writeFileSync(path.join(clientDir, "sw.js"), "// the service worker");
  writeFileSync(path.join(clientDir, "manifest.webmanifest"), "{}");
  writeFileSync(path.join(clientDir, "assets/index-abc123.js"), "// code");
});

const servers: HomeServer[] = [];
afterEach(async () => {
  for (const s of servers.splice(0)) await s.close();
});

async function get(route: string, withClient = true): Promise<Response> {
  const server = await startServer({
    port: 0,
    clientDir: withClient ? clientDir : undefined,
  });
  servers.push(server);
  return fetch(`http://localhost:${server.port}${route}`, {
    redirect: "manual",
  });
}

describe("the web client", () => {
  test("is served with its service worker and manifest revalidated on every load", async () => {
    for (const file of ["/", "/sw.js", "/manifest.webmanifest"]) {
      const response = await get(file);
      expect(response.status, file).toBe(200);
      expect(response.headers.get("cache-control"), file).toBe("no-cache");
    }
    expect(await (await get("/")).text()).toBe("<!doctype html>Home");
  });

  test("keeps fingerprinted assets for a year", async () => {
    const response = await get("/assets/index-abc123.js");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
  });

  test("answers any other page with its app shell", async () => {
    const response = await get("/somewhere/else");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("<!doctype html>Home");
  });
});

describe("the API", () => {
  test("sends a signed-out browser's page load back to the app, through the gateway", async () => {
    const response = await get("/api/sign-in");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/");
  });

  test("no longer says who is signed in, which the accounts site does", async () => {
    expect((await get("/api/me")).status).toBe(404);
  });

  test("answers its health without the web client", async () => {
    expect(await (await get("/api/health", false)).json()).toEqual({
      ok: true,
    });
  });
});
