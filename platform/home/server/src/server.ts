import path from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono, type Context } from "hono";

export interface ServerOptions {
  /** 0 picks a free port. */
  port: number;
  /** The web client's build (platform/home/web/dist). Without it, only the API is served. */
  clientDir?: string;
}

export async function startServer({ port, clientDir }: ServerOptions) {
  const app = new Hono();

  app.get("/api/health", (c) => c.json({ ok: true }));

  // A page load the service worker leaves to the network, so a signed-out browser meets the
  // gateway, which sends it to the accounts service's sign-in page and back here.
  app.get("/api/sign-in", (c) => c.redirect("/", 302));

  app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

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
