// Starts VoidAuth with empty data, takes the first-run link from its log and sets the instance
// admin's password, as a person would on first run.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestProject } from "vitest/node";
import {
  ADMIN_PASSWORD,
  compose,
  composeEnv,
  parseResetLink,
  resetPassword,
  waitForVoidAuth,
} from "./voidauth.ts";

declare module "vitest" {
  export interface ProvidedContext {
    composeEnv: Record<string, string>;
  }
}

export default async function setup(project: TestProject) {
  const dataDir = await mkdtemp(join(tmpdir(), "notes-e2e-voidauth-"));
  const env = composeEnv(dataDir);
  const stop = async () => {
    if (process.env.KEEP_VOIDAUTH) return;
    await compose(env, "down", "--volumes", "--remove-orphans");
    await rm(dataDir, { recursive: true, force: true });
  };
  await compose(env, "down", "--volumes", "--remove-orphans");
  try {
    await compose(env, "up", "--detach", "--wait");
    await waitForVoidAuth();
    let log = "";
    for (let i = 0; i < 60 && !parseResetLink(log); i++) {
      log = await compose(env, "logs", "voidauth");
      if (!parseResetLink(log))
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const reset = parseResetLink(log);
    if (!reset) throw new Error(`No first-run link in VoidAuth's log:\n${log}`);
    const response = await resetPassword(
      reset.userId,
      reset.challenge,
      ADMIN_PASSWORD,
    );
    if (!response.ok)
      throw new Error(`Setting the admin password failed: ${response.status}`);
    project.provide("composeEnv", env);
  } catch (error) {
    await stop();
    throw error;
  }
  return stop;
}
