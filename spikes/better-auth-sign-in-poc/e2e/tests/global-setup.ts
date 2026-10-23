// Starts the stack with empty data and sets it up as a homelab admin would on first run: the first
// admin from the link the accounts service prints, then an invite per person carrying the apps
// the admin grants them.
import { spawn, type ChildProcess } from "node:child_process";
import { X509Certificate, createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "@playwright/test";
import { launchOptions } from "../playwright.config.ts";
import {
  ACCOUNTS,
  ACCOUNTS_PORT,
  ADMIN,
  DOMAIN,
  GATEWAY_PORT,
  PEOPLE,
  SIGN_IN_RATE,
  acceptInvite,
  compose,
  createInvite,
  newDevice,
} from "./stack.ts";

const ACCOUNTS_DIR = fileURLToPath(new URL("../../accounts/", import.meta.url));

export default async function setup() {
  const dataDir = await mkdtemp(join(tmpdir(), "better-auth-sign-in-e2e-"));
  const env = {
    COMPOSE_PROJECT_NAME: "better-auth-sign-in-e2e",
    DATA_DIR: dataDir,
    GATEWAY_PORT: String(GATEWAY_PORT),
    ACCOUNTS_PORT: String(ACCOUNTS_PORT),
  };
  let accounts: ChildProcess | undefined;
  const stop = async () => {
    accounts?.kill();
    if (process.env.KEEP_STACK) return;
    await compose(env, "down", "--volumes", "--remove-orphans");
    await rm(dataDir, { recursive: true, force: true });
  };
  await compose(env, "down", "--volumes", "--remove-orphans");
  const browser = await chromium.launch(launchOptions);
  try {
    accounts = spawn(
      process.execPath,
      ["--no-experimental-webstorage", "src/index.ts"],
      {
        cwd: ACCOUNTS_DIR,
        env: {
          ...process.env,
          HOMELAB_DOMAIN: DOMAIN,
          ACCOUNTS_URL: ACCOUNTS,
          BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
          DATA_DIR: join(dataDir, "accounts"),
          PORT: String(ACCOUNTS_PORT),
          SIGN_IN_RATE_WINDOW: String(SIGN_IN_RATE.window),
          SIGN_IN_RATE_MAX: String(SIGN_IN_RATE.max),
        },
        stdio: ["ignore", "pipe", "inherit"],
      },
    );
    const firstRun = await firstRunLink(accounts);
    await compose(env, "up", "--detach", "--wait");
    process.env.GATEWAY_CA_SPKI = await gatewayCaSpki(dataDir);

    const admin = await (await newDevice(browser)).newPage();
    await waitForGateway(admin);
    await acceptInvite(admin, firstRun, ADMIN);
    for (const person of PEOPLE) {
      const url = await createInvite(admin, {
        email: person.email,
        groups: person.groups,
      });
      const page = await (await newDevice(browser)).newPage();
      await acceptInvite(page, url, person);
      await page.context().close();
    }
  } catch (error) {
    await stop();
    throw error;
  } finally {
    await browser.close();
  }
  return stop;
}

function firstRunLink(accounts: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let log = "";
    const timer = setTimeout(
      () =>
        reject(
          new Error(`No first-run link from the accounts service:\n${log}`),
        ),
      30_000,
    );
    accounts.stdout!.on("data", (chunk: Buffer) => {
      log += chunk;
      process.stdout.write(chunk);
      const link = /https:\/\/\S+\/invite\/[\w-]+/.exec(log)?.[0];
      if (link) {
        clearTimeout(timer);
        resolve(link);
      }
    });
    accounts.on("exit", (code) =>
      reject(new Error(`The accounts service exited (${code}):\n${log}`)),
    );
  });
}

/** The SHA-256 of the public key of the CA that signs the gateway's certificates, in base64. */
async function gatewayCaSpki(dataDir: string): Promise<string> {
  const path = join(
    dataDir,
    "caddy/caddy/pki/authorities/local/intermediate.crt",
  );
  for (let i = 0; i < 60; i++) {
    const pem = await readFile(path, "utf8").catch(() => null);
    if (pem) {
      const spki = new X509Certificate(pem).publicKey.export({
        type: "spki",
        format: "der",
      });
      return createHash("sha256").update(spki).digest("base64");
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`The gateway made no CA at ${path}`);
}

async function waitForGateway(page: Page): Promise<void> {
  for (let i = 0; i < 120; i++) {
    const response = await page.goto(`${ACCOUNTS}/sign-in`).catch(() => null);
    if (response?.ok()) return;
    await page.waitForTimeout(500);
  }
  throw new Error(
    "The accounts service did not answer through the gateway in time",
  );
}
