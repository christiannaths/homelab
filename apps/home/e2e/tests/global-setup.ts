// Builds the apps the stack serves, starts the gateway, VoidAuth and Notes with empty data, and
// loads the test people into VoidAuth as a homelab admin would grant them apps (ADR-PLAT-004).
import { execFileSync } from "node:child_process";
import { X509Certificate, createHash, randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFixtures, VoidAuthClient } from "@homelab/voidauth-fixtures";
import type { TestProject } from "vitest/node";
import {
  ACCOUNTS_URL,
  ADMIN,
  APPS,
  DOMAIN,
  GATEWAY_PORT,
  HOME_PORT,
  PEOPLE,
  compose,
  gatewayCaFile,
} from "./stack.ts";

declare module "vitest" {
  export interface ProvidedContext {
    gatewayCaSpki: string;
    dataDir: string;
    /** compose()'s environment, for tests that stop and start a service. */
    composeEnv: Record<string, string>;
  }
}

const ROOT = fileURLToPath(new URL("../../../..", import.meta.url));

export default async function setup(project: TestProject) {
  // Notes and the Encyclopedia belong to other apps, which this project may not depend on
  // (ADR-PLAT-002), so Nx doesn't build them first: they are built here, as `npm run dev` does.
  // Vitest sets NODE_ENV to test, which would build them without their service workers.
  execFileSync(
    "npx",
    ["nx", "run-many", "-t", "build", "-p", "notes-web", "encyclopedia-web"],
    {
      cwd: ROOT,
      env: { ...process.env, NODE_ENV: "production" },
      stdio: ["ignore", "ignore", "inherit"],
    },
  );
  const dataDir = await mkdtemp(join(tmpdir(), "home-e2e-stack-"));
  // Made here rather than by Docker, so they belong to this user and can be deleted afterwards.
  for (const dir of ["caddy", "voidauth/config", "voidauth/db", "notes"])
    await mkdir(join(dataDir, dir), { recursive: true });
  const env = {
    COMPOSE_PROJECT_NAME: "home-e2e",
    DATA_DIR: dataDir,
    GATEWAY_PORT: String(GATEWAY_PORT),
    HOME_PORT: String(HOME_PORT),
    HOMELAB_DOMAIN: DOMAIN,
    STORAGE_KEY: randomBytes(24).toString("hex"),
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
    await loadFixtures(
      new VoidAuthClient({
        url: ACCOUNTS_URL,
        ca: await gatewayFile(gatewayCaFile(dataDir)),
      }),
      {
        admin: ADMIN,
        apps: APPS,
        people: PEOPLE,
        readLog: () => compose(env, "logs", "voidauth"),
      },
    );
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
