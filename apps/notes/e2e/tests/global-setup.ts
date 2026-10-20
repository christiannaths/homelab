// Starts the gateway and VoidAuth with empty data and loads the test people into VoidAuth as a
// homelab admin would grant them Notes (ADR-PLAT-004).
import { X509Certificate, createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadFixtures, VoidAuthClient } from "@homelab/voidauth-fixtures";
import type { TestProject } from "vitest/node";
import {
  ACCOUNTS,
  ADMIN,
  AUTH_URL,
  DOMAIN,
  GATEWAY_PORT,
  NOTES_GROUPS,
  NOTES_PORT,
  compose,
} from "./stack.ts";

declare module "vitest" {
  export interface ProvidedContext {
    gatewayCaSpki: string;
  }
}

export default async function setup(project: TestProject) {
  const dataDir = await mkdtemp(join(tmpdir(), "notes-e2e-stack-"));
  const env = {
    COMPOSE_PROJECT_NAME: "notes-e2e",
    DATA_DIR: dataDir,
    GATEWAY_PORT: String(GATEWAY_PORT),
    NOTES_PORT: String(NOTES_PORT),
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
    await loadFixtures(
      new VoidAuthClient({
        url: AUTH_URL,
        ca: await gatewayFile(join(pki, "root.crt")),
      }),
      {
        admin: ADMIN,
        apps: [
          { name: "Notes", host: `notes.${DOMAIN}`, groups: NOTES_GROUPS },
        ],
        people: ACCOUNTS,
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
