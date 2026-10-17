// Calls VoidAuth's admin API as a signed-in admin. VoidAuth has no API tokens: its admin API only
// accepts the session cookie of a user in `auth_admins`, so this signs in the way its web UI does
// and keeps the cookies. Whoever holds these credentials can do anything an admin can.
import { CookieJar } from "./cookies.ts";

export const ADMIN_GROUP = "auth_admins";

export type Invitation = { id: string; challenge: string; email: string | null; link: string };

/** Sign `jar` in to VoidAuth itself (not to an app), as its web UI does. */
export async function signInToVoidAuth(jar: CookieJar, appUrl: string, input: string, password: string): Promise<void> {
  // Start an interaction with VoidAuth's own internal client, the same one its UI uses.
  const start = new URL(`${appUrl}/oidc/auth`);
  start.search = new URLSearchParams({
    client_id: "auth_internal_client",
    response_type: "none",
    redirect_uri: `${appUrl}/api/cb`,
    scope: "openid",
  }).toString();
  await jar.follow(start, (location) => location.pathname === "/login");
  const location = await submitLogin(jar, appUrl, input, password);
  await jar.follow(location, (next) => next.pathname === "/api/cb");
}

/** POST the login form inside a running interaction; returns where VoidAuth continues the flow. */
export async function submitLogin(jar: CookieJar, appUrl: string, input: string, password: string): Promise<string> {
  const response = await jar.fetch(`${appUrl}/api/interaction/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input, password, remember: true }),
  });
  if (!response.ok) throw new Error(`VoidAuth login failed for ${input}: ${response.status}`);
  const body = (await response.json()) as { success: boolean; location: string };
  return body.location;
}

export class VoidAuthAdmin {
  readonly #appUrl: string;
  readonly #username: string;
  readonly #password: string;
  #jar = new CookieJar();
  #signedIn = false;

  constructor(appUrl: string, username: string, password: string) {
    this.#appUrl = appUrl;
    this.#username = username;
    this.#password = password;
  }

  async #request(method: string, path: string, body?: unknown, retried = false): Promise<Response> {
    if (!this.#signedIn) {
      this.#jar = new CookieJar();
      await signInToVoidAuth(this.#jar, this.#appUrl, this.#username, this.#password);
      this.#signedIn = true;
    }
    const init: RequestInit = { method, headers: { "content-type": "application/json" } };
    if (body !== undefined) init.body = JSON.stringify(body);
    const response = await this.#jar.fetch(`${this.#appUrl}/api${path}`, init);
    if (response.status === 401 && !retried) {
      // The session ended (password reset, restart of an expired session): sign in once more.
      this.#signedIn = false;
      return this.#request(method, path, body, true);
    }
    return response;
  }

  /** Create a one-time invite link for `email`. The email is marked verified when it is accepted. */
  async createInvitation(email: string, name?: string): Promise<Invitation> {
    const response = await this.#request("POST", "/admin/invitation", {
      email,
      name: name ?? null,
      username: null,
      userExpiresAt: null,
      emailVerified: true,
      mfaRequired: false,
      groups: [],
      customClaims: [],
    });
    if (!response.ok) throw new Error(`Creating an invitation failed: ${response.status} ${await response.text()}`);
    const invitation = (await response.json()) as { id: string; challenge: string; email: string | null };
    return {
      ...invitation,
      link: `${this.#appUrl}/invite?invite=${invitation.id}&challenge=${invitation.challenge}`,
    };
  }
}
