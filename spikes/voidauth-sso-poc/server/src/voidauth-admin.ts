// Calls VoidAuth's admin API as a signed-in admin. VoidAuth has no API tokens: its admin API only
// accepts the session cookie of a user in `auth_admins`, so this signs in the way its web UI does
// and keeps the cookies. Whoever holds these credentials can do anything an admin can.
import { CookieJar } from "./cookies.ts";
import { nullableStringField, stringField } from "./json.ts";

export const ADMIN_GROUP = "auth_admins";

export type Invitation = {
  id: string;
  challenge: string;
  email: string | null;
  link: string;
};

/** Start an interaction with VoidAuth's own internal client, as its sign-in and invite pages do. */
export async function startVoidAuthInteraction(
  jar: CookieJar,
  voidauthUrl: string,
): Promise<void> {
  const start = new URL(`${voidauthUrl}/oidc/auth`);
  start.search = new URLSearchParams({
    client_id: "auth_internal_client",
    response_type: "none",
    redirect_uri: `${voidauthUrl}/api/cb`,
    scope: "openid",
  }).toString();
  await jar.follow(start, (location) => location.pathname === "/login");
}

/** Sign `jar` in to VoidAuth itself (not to an app), as its web UI does. */
export async function signInToVoidAuth(
  jar: CookieJar,
  voidauthUrl: string,
  input: string,
  password: string,
): Promise<void> {
  await startVoidAuthInteraction(jar, voidauthUrl);
  const location = await submitLogin(jar, voidauthUrl, input, password);
  await jar.follow(location, (next) => next.pathname === "/api/cb");
}

/** POST the login form inside a running interaction; returns where VoidAuth continues the flow. */
export async function submitLogin(
  jar: CookieJar,
  voidauthUrl: string,
  input: string,
  password: string,
): Promise<string> {
  const response = await jar.fetch(`${voidauthUrl}/api/interaction/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input, password, remember: true }),
  });
  if (!response.ok)
    throw new Error(`VoidAuth login failed for ${input}: ${response.status}`);
  const body: unknown = await response.json();
  return stringField(body, "location");
}

export class VoidAuthAdmin {
  readonly #voidauthUrl: string;
  readonly #username: string;
  readonly #password: string;
  #jar = new CookieJar();
  #signedIn = false;

  constructor(voidauthUrl: string, username: string, password: string) {
    this.#voidauthUrl = voidauthUrl;
    this.#username = username;
    this.#password = password;
  }

  async #request(
    method: string,
    path: string,
    body?: unknown,
    retried = false,
  ): Promise<Response> {
    if (!this.#signedIn) {
      this.#jar = new CookieJar();
      await signInToVoidAuth(
        this.#jar,
        this.#voidauthUrl,
        this.#username,
        this.#password,
      );
      this.#signedIn = true;
    }
    const init: RequestInit = {
      method,
      headers: { "content-type": "application/json" },
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    const response = await this.#jar.fetch(
      `${this.#voidauthUrl}/api${path}`,
      init,
    );
    if (response.status === 401 && !retried) {
      // The session ended (password reset, restart of an expired session): sign in once more.
      this.#signedIn = false;
      return this.#request(method, path, body, true);
    }
    return response;
  }

  /** Create a one-time invite link for `email`. The email is marked verified when it is accepted. */
  async createInvitation(email: string): Promise<Invitation> {
    const response = await this.#request("POST", "/admin/invitation", {
      email,
      name: null,
      username: null,
      userExpiresAt: null,
      emailVerified: true,
      mfaRequired: false,
      groups: [],
      customClaims: [],
    });
    if (!response.ok)
      throw new Error(
        `Creating an invitation failed: ${response.status} ${await response.text()}`,
      );
    const body: unknown = await response.json();
    const id = stringField(body, "id");
    const challenge = stringField(body, "challenge");
    return {
      id,
      challenge,
      email: nullableStringField(body, "email"),
      link: `${this.#voidauthUrl}/invite?invite=${id}&challenge=${challenge}`,
    };
  }
}
