// Starts the gateway and VoidAuth with empty data and sets VoidAuth up as a homelab admin would
// for Notes: the admin password from the first-run link, Notes' two groups, a ProxyAuth domain for
// Notes, and an invite per person carrying the groups the admin grants them (ADR-PLAT-004).
import { X509Certificate, createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright";
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
  launchChromium,
  newDevice,
  onVoidAuthSignIn,
  records,
  stringField,
  typePassword,
  voidauthApi,
  type Account,
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
    const reset = await firstRunLink(env);
    const spki = await gatewayCaSpki(dataDir);
    project.provide("gatewayCaSpki", spki);
    const browser = await launchChromium(spki);
    try {
      const admin = await newDevice(browser);
      await waitForGateway(admin);
      await voidauthApi(
        admin,
        "Setting the admin password",
        "POST",
        "/public/reset_password",
        {
          userId: reset.searchParams.get("id"),
          challenge: reset.searchParams.get("challenge"),
          newPassword: ADMIN.password,
        },
      );
      await admin.goto(`${AUTH_URL}/`);
      await onVoidAuthSignIn(admin);
      await typePassword(admin, ADMIN);
      await admin.waitForURL(`${AUTH_URL}/`);
      await setUpNotes(admin, browser);
    } finally {
      await browser.close();
    }
  } catch (error) {
    await stop();
    throw error;
  }
  return stop;
}

async function setUpNotes(
  admin: Page,
  browser: Awaited<ReturnType<typeof launchChromium>>,
): Promise<void> {
  for (const name of NOTES_GROUPS)
    await voidauthApi(admin, `Creating group ${name}`, "POST", "/admin/group", {
      name,
      mfaRequired: false,
      autoAssign: false,
      users: [],
      customClaims: [],
    });
  const groups = records(
    await voidauthApi(admin, "Listing groups", "GET", "/admin/groups"),
  ).map((g) => ({ id: stringField(g, "id"), name: stringField(g, "name") }));
  await voidauthApi(
    admin,
    "Adding Notes' ProxyAuth domain",
    "POST",
    "/admin/proxyauth",
    {
      domain: `notes.${DOMAIN}/*`,
      mfaRequired: false,
      maxSessionLength: null,
      groups: NOTES_GROUPS,
    },
  );
  for (const account of ACCOUNTS) {
    const invite = await voidauthApi(
      admin,
      `Inviting ${account.username}`,
      "POST",
      "/admin/invitation",
      {
        username: account.username,
        name: account.name,
        email: null,
        userExpiresAt: null,
        emailVerified: false,
        mfaRequired: false,
        groups: groups.filter((g) => account.groups.includes(g.name)),
        customClaims: [],
      },
    );
    await acceptInvite(await newDevice(browser), account, {
      inviteId: stringField(invite, "id"),
      challenge: stringField(invite, "challenge"),
    });
  }
}

/** The SHA-256 of the public key of the CA that signs the gateway's certificates, in base64. */
async function gatewayCaSpki(dataDir: string): Promise<string> {
  const file = join(
    dataDir,
    "caddy/caddy/pki/authorities/local/intermediate.crt",
  );
  for (let i = 0; i < 60; i++) {
    const pem = await readFile(file, "utf8").catch(() => null);
    if (pem) {
      const spki = new X509Certificate(pem).publicKey.export({
        type: "spki",
        format: "der",
      });
      return createHash("sha256").update(spki).digest("base64");
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`The gateway made no CA at ${file}`);
}

/** The first-run password link VoidAuth prints: `${APP_URL}/reset_password?id=…&challenge=…`. */
async function firstRunLink(env: Record<string, string>): Promise<URL> {
  for (let i = 0; i < 120; i++) {
    const log = await compose(env, "logs", "voidauth");
    const link =
      /https:\/\/\S+\/reset_password\?id=[\w-]+&challenge=[\w-]+/.exec(
        log,
      )?.[0];
    if (link) return new URL(link);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("No first-run link in VoidAuth's log");
}

async function waitForGateway(page: Page): Promise<void> {
  for (let i = 0; i < 120; i++) {
    const response = await page
      .goto(`${AUTH_URL}/api/public/config`)
      .catch(() => null);
    if (response?.ok()) return;
    await page.waitForTimeout(500);
  }
  throw new Error("VoidAuth did not answer through the gateway in time");
}

/** Creates the invited account inside a sign-in interaction, as VoidAuth's invite page does. */
async function acceptInvite(
  page: Page,
  account: Account,
  invite: { inviteId: string; challenge: string },
): Promise<void> {
  const start = new URL(`${AUTH_URL}/oidc/auth`);
  start.search = new URLSearchParams({
    client_id: "auth_internal_client",
    response_type: "none",
    redirect_uri: `${AUTH_URL}/api/cb`,
    scope: "openid",
  }).toString();
  await page.goto(start.href);
  await onVoidAuthSignIn(page);
  // Let the sign-in page finish its own start-up calls first, or they can replace the interaction.
  await page.waitForLoadState("networkidle");
  const location = stringField(
    await voidauthApi(
      page,
      `Accepting ${account.username}'s invite`,
      "POST",
      "/interaction/register",
      {
        username: account.username,
        password: account.password,
        name: account.name ?? undefined,
        ...invite,
      },
    ),
    "location",
  );
  // The flow carries on through redirects to VoidAuth's home page, now signed in.
  await page.goto(location).catch(() => {});
  await page.waitForURL(`${AUTH_URL}/`);
  await page.context().close();
}
