// Starts the stack with empty data and sets it up as a homelab admin would on first run: the
// admin password from the first-run link, one group per app (and per app level), one ProxyAuth
// domain per app, and an invite per person carrying the groups the admin grants them.
import { X509Certificate, createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { launchOptions } from "../playwright.config.ts";
import {
  ACCOUNTS,
  ADMIN,
  APP_DOMAINS,
  AUTH,
  GATEWAY_PORT,
  compose,
  newDevice,
  records,
  signIn,
  stringField,
  voidauthApi,
} from "./stack.ts";

export default async function setup() {
  const dataDir = await mkdtemp(join(tmpdir(), "voidauth-proxyauth-e2e-"));
  const env = {
    COMPOSE_PROJECT_NAME: "voidauth-proxyauth-e2e",
    DATA_DIR: dataDir,
    GATEWAY_PORT: String(GATEWAY_PORT),
    STORAGE_KEY: randomBytes(24).toString("hex"),
  };
  const stop = async () => {
    if (process.env.KEEP_STACK) return;
    await compose(env, "down", "--volumes", "--remove-orphans");
    await rm(dataDir, { recursive: true, force: true });
  };
  await compose(env, "down", "--volumes", "--remove-orphans");
  const browser = await chromium.launch(launchOptions);
  try {
    await compose(env, "up", "--detach", "--wait");
    const reset = await firstRunLink(env);
    process.env.GATEWAY_CA_SPKI = await gatewayCaSpki(dataDir);
    const admin = await (await newDevice(browser)).newPage();
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
    await admin.goto(`${AUTH}/`);
    await signIn(admin, ADMIN);
    await admin.waitForURL(`${AUTH}/`);

    const groupNames = [...new Set(ACCOUNTS.flatMap((a) => a.groups))];
    for (const name of groupNames)
      await voidauthApi(
        admin,
        `Creating group ${name}`,
        "POST",
        "/admin/group",
        {
          name,
          mfaRequired: false,
          autoAssign: false,
          users: [],
          customClaims: [],
        },
      );
    const groups = records(
      await voidauthApi(admin, "Listing groups", "GET", "/admin/groups"),
    ).map((g) => ({ id: stringField(g, "id"), name: stringField(g, "name") }));

    for (const { domain, groups: allowed } of APP_DOMAINS)
      await voidauthApi(
        admin,
        `Adding ProxyAuth domain ${domain}`,
        "POST",
        "/admin/proxyauth",
        { domain, mfaRequired: false, maxSessionLength: null, groups: allowed },
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
      await acceptInvite(await (await newDevice(browser)).newPage(), {
        ...account,
        inviteId: stringField(invite, "id"),
        challenge: stringField(invite, "challenge"),
      });
    }
  } catch (error) {
    await stop();
    throw error;
  } finally {
    await browser.close();
  }
  return stop;
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
      .goto(`${AUTH}/api/public/config`)
      .catch(() => null);
    if (response?.ok()) return;
    await page.waitForTimeout(500);
  }
  throw new Error("VoidAuth did not answer through the gateway in time");
}

/** Creates the invited account inside a sign-in interaction, as VoidAuth's invite page does. */
async function acceptInvite(
  page: Page,
  registration: {
    username: string;
    password: string;
    name: string;
    inviteId: string;
    challenge: string;
  },
): Promise<void> {
  const start = new URL(`${AUTH}/oidc/auth`);
  start.search = new URLSearchParams({
    client_id: "auth_internal_client",
    response_type: "none",
    redirect_uri: `${AUTH}/api/cb`,
    scope: "openid",
  }).toString();
  await page.goto(start.href);
  await page.waitForURL(`${AUTH}/login**`);
  // Let the sign-in page finish its own start-up calls first, or they can replace the interaction.
  await page.waitForLoadState("networkidle");
  const location = stringField(
    await voidauthApi(
      page,
      `Accepting ${registration.username}'s invite`,
      "POST",
      "/interaction/register",
      registration,
    ),
    "location",
  );
  // The flow carries on through redirects to VoidAuth's home page, now signed in.
  await page.goto(location).catch(() => {});
  await page.waitForURL(`${AUTH}/`);
  await page.context().close();
}
