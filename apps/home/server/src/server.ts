import { readFile } from "node:fs/promises";
import path from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type Context } from "hono";
import { identityFrom } from "@homelab/gateway";
import { AppDirectory } from "./apps.ts";
import {
  manifestReader,
  type GatewayAddress,
  type ReadManifest,
} from "./manifests.ts";

export interface ServerOptions {
  /**
   * The homelab's parent address, such as `https://home.example`: every app is a subdomain of
   * it, VoidAuth is `accounts.` and Home itself `home.` (ADR-PLAT-004). Its port, if any, is every
   * app's port.
   */
  homelabUrl: string;
  /** 0 picks a free port. */
  port: number;
  /** How Home reaches the gateway to read apps' manifests. By default, at each app's address. */
  gateway?: GatewayAddress;
  /** Replaces reading manifests through the gateway, for tests. */
  readManifest?: ReadManifest;
  /** The web client's build (apps/home/web/dist). Without it, only the API is served. */
  clientDir?: string;
  /** The App switcher's built script (packages/app-switcher/dist/switcher.js), served for every app. */
  switcherScript?: string;
}

export async function startServer({
  homelabUrl,
  port,
  gateway = {},
  readManifest = manifestReader(gateway),
  clientDir,
  switcherScript,
}: ServerOptions) {
  const homelab = new URL(homelabUrl);
  const apps = new AppDirectory(homelab, readManifest);
  const signOutUrl = new URL("/logout", apps.urlOf("accounts")).href;

  /** Any app under the parent domain, on its scheme and port, may read the answer. */
  const isHomelabApp = (origin: string): boolean => {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      return false;
    }
    const [label, ...parent] = url.hostname.split(".");
    return (
      url.protocol === homelab.protocol &&
      url.port === homelab.port &&
      parent.join(".") === homelab.hostname &&
      /^[a-z0-9-]+$/.test(label ?? "")
    );
  };

  const app = new Hono();

  // Apps ask from their own pages, with the homelab's cookie, so the answer names their origin.
  // A GET with no custom headers needs no preflight, which the gateway could not let through:
  // a preflight carries no cookie. The switcher's script is loaded the same way, so an app's
  // service worker can tell a failed load from a good one before keeping it.
  const allowHomelabApps = async (c: Context, next: () => Promise<void>) => {
    await next();
    const origin = c.req.header("origin");
    c.header("vary", "Origin", { append: true });
    if (origin && isHomelabApp(origin)) {
      c.header("access-control-allow-origin", origin);
      c.header("access-control-allow-credentials", "true");
    }
  };
  app.use("/api/*", allowHomelabApps);
  app.use("/switcher.js", allowHomelabApps);

  app.get("/api/health", (c) => c.json({ ok: true }));

  // A page load the service worker leaves to the network, so a signed-out browser meets the
  // gateway, which sends it to VoidAuth's sign-in page and back here.
  app.get("/api/sign-in", (c) => c.redirect("/", 302));

  // Who is signed in and which apps they have, for Home's tiles and every app's App switcher.
  app.get("/api/me", async (c) => {
    const identity = identityFrom(c.req.raw.headers);
    if (!identity) return c.json({ error: "signed_out" }, 401);
    c.header("cache-control", "no-store");
    return c.json({
      person: {
        username: identity.username,
        name: identity.name,
        email: identity.email,
      },
      signOutUrl,
      apps: await apps.appsFor(identity.groups),
    });
  });

  app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

  if (switcherScript) {
    // Revalidated on every load, so a new switcher reaches every app as soon as Home has it.
    app.get("/switcher.js", async (c) => {
      const script = await readFile(switcherScript, "utf8").catch(
        () => undefined,
      );
      if (script === undefined) return c.text("Not Found", 404);
      c.header("cache-control", "no-cache");
      c.header("content-type", "text/javascript; charset=utf-8");
      return c.body(script);
    });
  }

  if (clientDir) {
    // The service worker and the app shell must be revalidated so updates reach devices; Vite
    // fingerprints everything under assets/, so those never change.
    const onFound = (filePath: string, c: Context) => {
      c.header(
        "cache-control",
        filePath.includes(`${path.sep}assets${path.sep}`)
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      );
    };
    app.use("*", serveStatic({ root: clientDir, onFound }));
    app.get("*", serveStatic({ root: clientDir, path: "index.html", onFound }));
  }

  const server = serve({ fetch: app.fetch, port });
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (typeof address !== "object" || address === null)
    throw new Error("Server is not listening on a TCP port");
  return {
    port: address.port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export type HomeServer = Awaited<ReturnType<typeof startServer>>;
