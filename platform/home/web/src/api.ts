// Home's question of the accounts site's `/api/me` (platform/accounts/README.md), asked from Home's
// page with the homelab's cookie. The answer reads as the App switcher reads it.
import { accountsOrigin } from "@homelab/app-switcher/me";

/**
 * Asks the accounts site who is signed in. It is outside the gateway's sign-in check, so a
 * signed-out browser gets a 401 it can read; signing in is left to a page load.
 */
export const askMe = (): Promise<Response> =>
  fetch(`${accountsOrigin(location)}/api/me`, {
    credentials: "include",
    cache: "no-store",
  });

export const isSignedOut = (response: { status: number }): boolean =>
  response.status === 401;

/** A page load the service worker leaves to the network, so it reaches the gateway. */
export const SIGN_IN_PATH = "/api/sign-in";
