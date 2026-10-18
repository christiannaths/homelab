// A person with a browser's cookie jar, walking VoidAuth's pages the way its web UI does
// (its UI is a single-page app calling these JSON endpoints).
import { NOTES_URL, VOIDAUTH_URL } from "./voidauth.ts";

class CookieJar {
  readonly #byHost = new Map<string, Map<string, string>>();

  #store(url: URL, response: Response): void {
    const cookies = this.#byHost.get(url.host) ?? new Map<string, string>();
    for (const line of response.headers.getSetCookie()) {
      const [pair = "", ...attributes] = line.split(";");
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const expired = attributes.some(
        (a) =>
          /^\s*max-age=0\s*$/i.test(a) ||
          /^\s*expires=thu, 01 jan 1970/i.test(a),
      );
      if (expired || value === "") cookies.delete(name);
      else cookies.set(name, value);
    }
    this.#byHost.set(url.host, cookies);
  }

  header(url: string | URL): string {
    return [...(this.#byHost.get(new URL(url).host) ?? [])]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  /** fetch with this jar's cookies, never following redirects itself. */
  async fetch(url: string | URL, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    const cookie = this.header(url);
    if (cookie) headers.set("cookie", cookie);
    const response = await fetch(url, { ...init, headers, redirect: "manual" });
    this.#store(new URL(url), response);
    return response;
  }

  /** GET `url` and follow redirects until `stop` matches the next location or a non-redirect arrives. */
  async follow(
    url: string | URL,
    stop: (location: URL) => boolean = () => false,
  ): Promise<{ url: URL; response: Response }> {
    let current = new URL(url);
    for (let hop = 0; hop < 20; hop++) {
      const response = await this.fetch(current);
      const location = response.headers.get("location");
      if (response.status < 300 || response.status >= 400 || !location)
        return { url: current, response };
      const next = new URL(location, current);
      if (stop(next)) return { url: next, response };
      current = next;
    }
    throw new Error(`Too many redirects from ${String(url)}`);
  }
}

const onVoidAuthLogin = (l: URL) =>
  l.origin === VOIDAUTH_URL && l.pathname === "/login";
/** Notes' callback redirected to the app: to `/`, or to `/no-access` for someone it turned away. */
const backInNotes = (l: URL) =>
  l.origin === NOTES_URL && (l.pathname === "/" || l.pathname === "/no-access");

export interface Registration {
  username: string;
  password: string;
  name?: string;
}

export class Browser {
  readonly jar = new CookieJar();

  /** The Notes session cookie, as the browser sends it on the sync upgrade. */
  get notesCookie(): string {
    return this.jar.header(NOTES_URL);
  }

  /**
   * Opens Notes' sign-in and types a password on VoidAuth's page if it asks for one.
   * Returns the status of Notes' callback, with where it redirected to or what it answered.
   */
  async signInToNotes(
    username?: string,
    password?: string,
  ): Promise<{ status: number; body: unknown }> {
    const started = await this.jar.follow(
      `${NOTES_URL}/api/sign-in`,
      (l) => onVoidAuthLogin(l) || backInNotes(l),
    );
    // Already signed in to VoidAuth: it went straight back through Notes' callback.
    let { url, response } = started;
    if (onVoidAuthLogin(url)) {
      if (!username || !password)
        throw new Error("VoidAuth asked for a password");
      ({ url, response } = await this.jar.follow(
        await this.#submitLogin(username, password),
        backInNotes,
      ));
    }
    if (backInNotes(url)) return { status: 302, body: url.pathname };
    return {
      status: response.status,
      body: await response.json().catch(() => null),
    };
  }

  /** Signs in to VoidAuth itself, as its own web page does, not to an app. */
  async signInToVoidAuth(username: string, password: string): Promise<void> {
    await this.#startVoidAuthInteraction();
    const location = await this.#submitLogin(username, password);
    await this.jar.follow(location, (l) => l.pathname === "/api/cb");
  }

  /** As a signed-in VoidAuth admin, creates a one-time invite link, as the invite service will. */
  async createInvite(): Promise<string> {
    const response = await this.voidauth("POST", "/admin/invitation", {
      email: null,
      name: null,
      username: null,
      userExpiresAt: null,
      emailVerified: false,
      mfaRequired: false,
      groups: [],
      customClaims: [],
    });
    if (!response.ok)
      throw new Error(
        `Creating an invite failed: ${response.status} ${await response.text()}`,
      );
    const invite: unknown = await response.json();
    const id = stringField(invite, "id");
    const challenge = stringField(invite, "challenge");
    return `${VOIDAUTH_URL}/invite?invite=${id}&challenge=${challenge}`;
  }

  /** Opens a VoidAuth invite link and creates the account it allows. */
  async acceptInvite(
    link: string,
    registration: Registration,
  ): Promise<Response> {
    const url = new URL(link);
    await this.#startVoidAuthInteraction();
    const response = await this.register({
      ...registration,
      inviteId: url.searchParams.get("invite")!,
      challenge: url.searchParams.get("challenge")!,
    });
    if (response.ok) {
      const location = stringField(await response.json(), "location");
      await this.jar.follow(location, (l) => l.pathname === "/api/cb");
    }
    return response;
  }

  /** Registers on VoidAuth's sign-in page, with or without an invite. */
  register(
    body: Registration & { inviteId?: string; challenge?: string },
  ): Promise<Response> {
    return this.jar.fetch(`${VOIDAUTH_URL}/api/interaction/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  voidauth(method: string, path: string, body?: unknown): Promise<Response> {
    const init: RequestInit = {
      method,
      headers: { "content-type": "application/json" },
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    return this.jar.fetch(`${VOIDAUTH_URL}/api${path}`, init);
  }

  notes(method: string, path: string): Promise<Response> {
    return this.jar.fetch(`${NOTES_URL}${path}`, { method });
  }

  /** Starts an interaction with VoidAuth's own internal client, as its sign-in and invite pages do. */
  async #startVoidAuthInteraction(): Promise<void> {
    const start = new URL(`${VOIDAUTH_URL}/oidc/auth`);
    start.search = new URLSearchParams({
      client_id: "auth_internal_client",
      response_type: "none",
      redirect_uri: `${VOIDAUTH_URL}/api/cb`,
      scope: "openid",
    }).toString();
    await this.jar.follow(start, onVoidAuthLogin);
  }

  /** Posts VoidAuth's login form inside a running interaction; returns where the flow continues. */
  async #submitLogin(username: string, password: string): Promise<string> {
    const response = await this.jar.fetch(
      `${VOIDAUTH_URL}/api/interaction/login`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: username, password, remember: true }),
      },
    );
    if (!response.ok)
      throw new Error(
        `VoidAuth sign-in failed for ${username}: ${response.status}`,
      );
    return stringField(await response.json(), "location");
  }
}

/** A string field of a VoidAuth JSON response, failing the test when the response has another shape. */
function stringField(body: unknown, key: string): string {
  const value = isRecord(body) ? body[key] : undefined;
  if (typeof value !== "string")
    throw new Error(`VoidAuth response has no ${key}: ${JSON.stringify(body)}`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
