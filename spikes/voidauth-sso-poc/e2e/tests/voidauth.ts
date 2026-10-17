// Drives the spike's compose.yaml: one VoidAuth container with its data in a fresh temp directory.
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
export const COMPOSE_FILE = fileURLToPath(
  new URL("../../compose.yaml", import.meta.url),
);

export const VOIDAUTH_PORT = 3310;
export const APP_PORT = 4110;
export const VOIDAUTH_URL = `http://localhost:${VOIDAUTH_PORT}`;
export const APP_URL = `http://localhost:${APP_PORT}`;
export const NOTES_CLIENT_SECRET = "notes-e2e-secret";
export const PROJECT = "voidauth-sso-poc-e2e";

export type ComposeEnv = Record<string, string>;

export function composeEnv(
  dataDir: string,
  overrides: ComposeEnv = {},
): ComposeEnv {
  return {
    COMPOSE_PROJECT_NAME: PROJECT,
    VOIDAUTH_DATA: dataDir,
    VOIDAUTH_PORT: String(VOIDAUTH_PORT),
    APP_URL: VOIDAUTH_URL,
    STORAGE_KEY: randomBytes(24).toString("hex"),
    DEFAULT_REDIRECT: `${APP_URL}/`,
    NOTES_CLIENT_SECRET,
    NOTES_REDIRECT_URL: `${APP_URL}/callback`,
    // The suite signs many people in from one address; VoidAuth limits per address, not per account.
    API_RATELIMIT: "1000",
    ...overrides,
  };
}

export async function compose(
  env: ComposeEnv,
  ...args: string[]
): Promise<string> {
  return composeWith(COMPOSE_FILE, env, ...args);
}

export async function composeWith(
  file: string,
  env: ComposeEnv,
  ...args: string[]
): Promise<string> {
  const { stdout, stderr } = await run(
    "docker",
    ["compose", "-f", file, ...args],
    {
      env: { ...process.env, ...env },
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  return stdout + stderr;
}

export async function waitForVoidAuth(timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(
        `${VOIDAUTH_URL}/oidc/.well-known/openid-configuration`,
      );
      if (response.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("VoidAuth did not start in time");
}

/** A password reset link from VoidAuth's output: `${APP_URL}/reset_password?id=…&challenge=…`. */
export function parseResetLink(
  output: string,
): { link: string; userId: string; challenge: string } | undefined {
  const link =
    /https?:\/\/\S+\/reset_password\?id=[\w-]+&challenge=[\w-]+/.exec(
      output,
    )?.[0];
  if (!link) return undefined;
  const url = new URL(link);
  return {
    link,
    userId: url.searchParams.get("id") as string,
    challenge: url.searchParams.get("challenge") as string,
  };
}

export async function resetPassword(
  userId: string,
  challenge: string,
  newPassword: string,
): Promise<Response> {
  return fetch(`${VOIDAUTH_URL}/api/public/reset_password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId, challenge, newPassword }),
  });
}
