// The gateway image (../Dockerfile) run alone, in front of stand-ins on this machine, for the
// gateway's own tests. Needs Docker.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import {
  createServer,
  request,
  type IncomingHttpHeaders,
  type RequestListener,
} from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { GATEWAY_IMAGE } from "../src/image.ts";

/** A server on this machine, which the gateway reaches at host.docker.internal:<port>. */
export function listen(handler: RequestListener): Promise<{
  port: number;
  close: () => void;
}> {
  const server = createServer(handler);
  return new Promise((resolve) =>
    server.listen(0, "0.0.0.0", () => {
      const address = server.address();
      resolve({
        port: typeof address === "object" && address ? address.port : 0,
        close: () => server.close(),
      });
    }),
  );
}

export interface Gateway {
  port: number;
  stop(): void;
}

/** Runs the image with `caddyfile`, which serves plain HTTP on port 80. */
export async function startGateway(
  name: string,
  caddyfile: string,
  env: Record<string, string> = {},
): Promise<Gateway> {
  const dir = mkdtempSync(path.join(tmpdir(), "gateway-test-"));
  writeFileSync(path.join(dir, "Caddyfile"), caddyfile);
  const stop = () =>
    execFileSync("docker", ["rm", "--force", name], { stdio: "ignore" });
  stop();
  execFileSync(
    "docker",
    [
      "run",
      "--detach",
      "--name",
      name,
      "--publish",
      "127.0.0.1::80",
      "--add-host",
      "host.docker.internal:host-gateway",
      ...Object.entries(env).flatMap(([key, value]) => [
        "--env",
        `${key}=${value}`,
      ]),
      "--volume",
      `${dir}/Caddyfile:/etc/caddy/Caddyfile:ro`,
      GATEWAY_IMAGE,
    ],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
  const port = Number(
    execFileSync("docker", ["port", name, "80"], { encoding: "utf8" })
      .split(":")
      .at(-1),
  );
  for (let i = 0; i < 100; i++) {
    const up = await get(port, "localhost", "/").catch(() => undefined);
    if (up) return { port, stop };
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  stop();
  throw new Error("Caddy did not start within 10 seconds");
}

export interface Reply {
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

/** A request to the gateway, for the site named `host`. */
export function get(
  port: number,
  host: string,
  route: string,
  headers: Record<string, string> = {},
  method = "GET",
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    request(
      {
        host: "127.0.0.1",
        port,
        method,
        path: route,
        headers: { host, ...headers },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          }),
        );
      },
    )
      .on("error", reject)
      .end();
  });
}
