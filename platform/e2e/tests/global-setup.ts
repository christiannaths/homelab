// Builds the gateway, starts it, the accounts service and Notes with empty data, and loads the test
// people into the accounts service with their App access (ADR-PLAT-004). Nx builds Home, Notes and
// the Encyclopedia before this suite starts (implicitDependencies in package.json), outside
// Vitest, whose NODE_ENV of test would build them without their service workers.
import { X509Certificate, createHash, randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildGatewayImage } from "@homelab/gateway/image";
import type { TestProject } from "vitest/node";
import {
  DOMAIN,
  GATEWAY_PORT,
  HOME_PORT,
  HOMELAB_URL,
  PEOPLE,
  compose,
  loadPeople,
} from "./stack.ts";

declare module "vitest" {
  export interface ProvidedContext {
    gatewayCaSpki: string;
    dataDir: string;
    /** compose()'s environment, for tests that stop and start a service. */
    composeEnv: Record<string, string>;
    /** Each test person's account id, by email. */
    accountIds: Record<string, string>;
  }
}

export default async function setup(project: TestProject) {
  buildGatewayImage();
  const dataDir = await mkdtemp(join(tmpdir(), "platform-e2e-stack-"));
  // Made here rather than by Docker, so they belong to this user and can be deleted afterwards.
  for (const dir of ["caddy", "accounts", "notes"])
    await mkdir(join(dataDir, dir), { recursive: true });
  const env = {
    COMPOSE_PROJECT_NAME: "platform-e2e",
    DATA_DIR: dataDir,
    GATEWAY_PORT: String(GATEWAY_PORT),
    HOME_PORT: String(HOME_PORT),
    HOMELAB_URL,
    // Caddy names sites by hostname, so the gateway gets the one in HOMELAB_URL.
    SITE_DOMAIN: DOMAIN,
    ACCOUNTS_SECRET: randomBytes(24).toString("hex"),
  };
  const stop = async () => {
    if (process.env.KEEP_STACK) return;
    await compose(env, "down", "--volumes", "--remove-orphans");
    await rm(dataDir, { recursive: true, force: true });
  };
  await compose(env, "down", "--volumes", "--remove-orphans");
  try {
    await compose(env, "up", "--detach", "--wait");
    const pki = join(dataDir, "caddy/caddy/pki/authorities/local");
    project.provide(
      "gatewayCaSpki",
      spkiHash(await gatewayFile(join(pki, "intermediate.crt"))),
    );
    project.provide("dataDir", dataDir);
    project.provide("composeEnv", env);
    // Home reads apps' manifests through the gateway, trusting its root certificate.
    await gatewayFile(join(pki, "root.crt"));
    project.provide("accountIds", await loadPeople(env, PEOPLE));
  } catch (error) {
    await stop();
    throw error;
  }
  return stop;
}

/** A certificate the gateway writes on first start, once it is there. */
async function gatewayFile(file: string): Promise<string> {
  for (let i = 0; i < 60; i++) {
    const pem = await readFile(file, "utf8").catch(() => null);
    if (pem) return pem;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`The gateway made no CA at ${file}`);
}

/** The SHA-256 of a certificate's public key, in base64, as Chromium's SPKI allow-list takes it. */
function spkiHash(pem: string): string {
  const spki = new X509Certificate(pem).publicKey.export({
    type: "spki",
    format: "der",
  });
  return createHash("sha256").update(spki).digest("base64");
}
