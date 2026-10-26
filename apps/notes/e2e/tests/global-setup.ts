// Builds the gateway, starts it and the accounts service with empty data, and loads the test people
// into the accounts service with their App access to Notes (ADR-PLAT-004).
import { execFileSync } from "node:child_process";
import { X509Certificate, createHash, randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TestProject } from "vitest/node";
import {
  ACCOUNTS,
  DOMAIN,
  GATEWAY_PORT,
  NOTES_PORT,
  compose,
  loadPeople,
} from "./stack.ts";

declare module "vitest" {
  export interface ProvidedContext {
    gatewayCaSpki: string;
    /** Each test person's account id, by email. */
    accountIds: Record<string, string>;
  }
}

const ROOT = fileURLToPath(new URL("../../../..", import.meta.url));

/**
 * Builds the gateway image (platform/gateway/Dockerfile) as the stack runs it. Notes may not import
 * the platform's own builder (ADR-PLAT-002), so it builds the image by its path until this suite
 * runs Notes behind a stand-in instead (issue #126).
 */
function buildGatewayImage(): void {
  // Behind a proxy that intercepts TLS, as in a cloud environment, npm and Go need its CA.
  const ca = process.env.NODE_EXTRA_CA_CERTS;
  execFileSync(
    "docker",
    [
      "build",
      "--quiet",
      "--tag",
      "homelab-gateway",
      "--file",
      "platform/gateway/Dockerfile",
      ...(ca ? ["--secret", `id=ca-certs,src=${ca}`] : []),
      ".",
    ],
    { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"] },
  );
}

export default async function setup(project: TestProject) {
  buildGatewayImage();
  const dataDir = await mkdtemp(join(tmpdir(), "notes-e2e-stack-"));
  // Made here rather than by Docker, so they belong to this user and can be deleted afterwards.
  for (const dir of ["caddy", "accounts"])
    await mkdir(join(dataDir, dir), { recursive: true });
  const env = {
    COMPOSE_PROJECT_NAME: "notes-e2e",
    DATA_DIR: dataDir,
    GATEWAY_PORT: String(GATEWAY_PORT),
    NOTES_PORT: String(NOTES_PORT),
    HOMELAB_DOMAIN: DOMAIN,
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
    project.provide("accountIds", await loadPeople(env, ACCOUNTS));
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
