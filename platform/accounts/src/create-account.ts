// Making an account: Better Auth's user and password, and the person's App access (ADR-PLAT-004).
import { runWithTransaction } from "@better-auth/core/context";
import type { AppAccess, Grants } from "./app-access.ts";
import type { BetterAuth } from "./better-auth.ts";

export interface NewAccount {
  /** Lowercase. */
  email: string;
  name: string;
  password: string;
  homelabAdmin: boolean;
  /** App access to installed apps only. */
  grants: Grants;
}

/**
 * Makes the account, all or nothing. `claim` runs first in the same transaction, to take what the
 * account is made with (an invite), and is rolled back with it. Returns the new account's id, or
 * nothing, with nothing made, when the email already has an account or `claim` returns false.
 * Throws for an app that isn't installed.
 */
export async function createAccount(
  { betterAuth, appAccess }: { betterAuth: BetterAuth; appAccess: AppAccess },
  person: NewAccount,
  { method, claim = () => true }: { method: string; claim?: () => boolean },
): Promise<string | undefined> {
  const ctx = await betterAuth.$context;
  // Hashed before the transaction, which holds the database until it ends.
  const hash = await ctx.password.hash(person.password);
  // Better Auth's calls inside join this transaction; the service's own tables are on the same
  // SQLite connection, so they do too.
  return runWithTransaction(ctx.adapter, async () => {
    if (await ctx.internalAdapter.findUserByEmail(person.email))
      return undefined;
    if (!claim()) return undefined;
    const user = await ctx.internalAdapter.createUser(
      {
        email: person.email,
        name: person.name,
        emailVerified: true,
        homelabAdmin: person.homelabAdmin,
      },
      { method },
    );
    await ctx.internalAdapter.linkAccount({
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: hash,
    });
    appAccess.set(user.id, person.grants);
    return user.id;
  });
}
