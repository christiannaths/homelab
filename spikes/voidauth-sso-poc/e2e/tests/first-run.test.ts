// Question 4: the first-run setup link in the log, and the CLI password reset.
import { describe, expect, inject, it } from "vitest";
import { ADMIN_PASSWORD } from "./global-setup.ts";
import { Person } from "./person.ts";
import { compose, parseResetLink, resetPassword } from "./voidauth.ts";

const env = inject("composeEnv");

describe("first run", () => {
  it("prints a one-day password reset link for the initial admin user in the log", () => {
    const log = inject("firstRunLog");
    expect(log).toContain("Password reset link for the initial admin user, valid for 1 day:");
    expect(parseResetLink(log)).toBeDefined();
  });

  it("uses the first-run link once", async () => {
    const { userId, challenge } = parseResetLink(inject("firstRunLog"))!;
    expect((await resetPassword(userId, challenge, "another-quartz-harbour-72")).status).toBe(400);
  });
});

describe("recovery from the command line", () => {
  it("prints a reset link with `docker compose run voidauth user password-reset <username>`, and the link works", async () => {
    const output = await compose(env, "run", "--rm", "--no-deps", "voidauth", "user", "password-reset", "auth_admin");
    const reset = parseResetLink(output);
    expect(reset, output).toBeDefined();

    const signedIn = new Person();
    await signedIn.signInToVoidAuth("auth_admin", ADMIN_PASSWORD);
    expect((await signedIn.voidauth("GET", "/user/me")).status).toBe(200);

    const temporary = "recovered-lantern-harbour-55";
    expect((await resetPassword(reset!.userId, reset!.challenge, temporary)).status).toBe(200);
    // Resetting the password ends the person's existing VoidAuth sessions.
    expect((await signedIn.voidauth("GET", "/user/me")).status).toBe(401);
    await new Person().signInToVoidAuth("auth_admin", temporary);

    // Put the suite's admin password back, this time through `exec` in the running container.
    const again = parseResetLink(await compose(env, "exec", "-T", "voidauth", "node", "./dist/index.mjs", "user", "password-reset", "auth_admin"));
    expect((await resetPassword(again!.userId, again!.challenge, ADMIN_PASSWORD)).status).toBe(200);
  });
});
