// Drives compose.yaml: one VoidAuth container with its data in a fresh temp directory.
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const COMPOSE_FILE = fileURLToPath(new URL("../compose.yaml", import.meta.url));

export const VOIDAUTH_PORT = 3330;
export const NOTES_PORT = 4120;
export const VOIDAUTH_URL = `http://localhost:${VOIDAUTH_PORT}`;
export const NOTES_URL = `http://localhost:${NOTES_PORT}`;
export const NOTES_CLIENT_SECRET = "notes-e2e-secret";
/** The instance admin VoidAuth creates on first run. */
export const ADMIN_USERNAME = "auth_admin";
export const ADMIN_PASSWORD = "violet-quartz-harbour-71";
/** The display name VoidAuth gives that admin. */
export const ADMIN_NAME = "Auth Admin";

export type ComposeEnv = Record<string, string>;

export function composeEnv(dataDir: string): ComposeEnv {
  return {
    COMPOSE_PROJECT_NAME: "notes-e2e",
    VOIDAUTH_DATA: dataDir,
    VOIDAUTH_PORT: String(VOIDAUTH_PORT),
    APP_URL: VOIDAUTH_URL,
    STORAGE_KEY: randomBytes(24).toString("hex"),
    DEFAULT_REDIRECT: `${NOTES_URL}/`,
    NOTES_CLIENT_SECRET,
    NOTES_REDIRECT_URL: `${NOTES_URL}/api/sign-in/callback`,
    NOTES_POST_LOGOUT_URL: `${NOTES_URL}/`,
  };
}

export async function compose(
  env: ComposeEnv,
  ...args: string[]
): Promise<string> {
  const { stdout, stderr } = await run(
    "docker",
    ["compose", "-f", COMPOSE_FILE, ...args],
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
      if (
        (await fetch(`${VOIDAUTH_URL}/oidc/.well-known/openid-configuration`))
          .ok
      )
        return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("VoidAuth did not start in time");
}

/** The first-run password link VoidAuth prints: `${APP_URL}/reset_password?id=…&challenge=…`. */
export function parseResetLink(
  output: string,
): { userId: string; challenge: string } | undefined {
  const link =
    /https?:\/\/\S+\/reset_password\?id=[\w-]+&challenge=[\w-]+/.exec(
      output,
    )?.[0];
  if (!link) return undefined;
  const url = new URL(link);
  return {
    userId: url.searchParams.get("id")!,
    challenge: url.searchParams.get("challenge")!,
  };
}

export function resetPassword(
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
