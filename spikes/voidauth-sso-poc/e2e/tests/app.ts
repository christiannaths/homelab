// Starts the Notes stand-in in this test process, pointed at the VoidAuth container.
import { createApp, type App } from "@homelab/voidauth-sso-poc-server";
import { VoidAuthAdmin } from "@homelab/voidauth-sso-poc-server/voidauth-admin";
import { ADMIN_PASSWORD } from "./global-setup.ts";
import {
  APP_PORT,
  APP_URL,
  NOTES_CLIENT_SECRET,
  VOIDAUTH_URL,
} from "./voidauth.ts";

export async function startApp(): Promise<
  App & { close: () => Promise<void> }
> {
  const app = createApp({
    baseUrl: APP_URL,
    oidc: {
      issuer: `${VOIDAUTH_URL}/oidc`,
      clientId: "notes",
      clientSecret: NOTES_CLIENT_SECRET,
      redirectUri: `${APP_URL}/callback`,
    },
    voidauthAdmin: new VoidAuthAdmin(
      VOIDAUTH_URL,
      "auth_admin",
      ADMIN_PASSWORD,
    ),
  });
  await new Promise<void>((resolve) => app.server.listen(APP_PORT, resolve));
  return {
    ...app,
    close: () =>
      new Promise((resolve) => {
        app.server.closeAllConnections();
        app.server.close(() => resolve());
      }),
  };
}

let counter = 0;
/** A unique username and email per call, so test files never collide. */
export function newPerson(prefix: string) {
  counter += 1;
  const id = `${prefix}_${process.pid}_${counter}`;
  return {
    username: id,
    email: `${id}@example.com`.toLowerCase(),
    password: `amber-${id}-lighthouse-93`,
  };
}
