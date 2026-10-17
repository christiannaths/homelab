// A person with a browser's cookie jar, walking VoidAuth's pages the way its web UI does
// (its UI is a single-page app calling these JSON endpoints).
import { CookieJar } from "@homelab/voidauth-sso-poc-server/cookies";
import { signInToVoidAuth, submitLogin } from "@homelab/voidauth-sso-poc-server/voidauth-admin";
import WebSocket from "ws";
import { APP_URL, VOIDAUTH_URL } from "./voidauth.ts";

const onVoidAuthLogin = (location: URL) => location.origin === VOIDAUTH_URL && location.pathname === "/login";
const backAtApp = (location: URL) => location.origin === APP_URL && location.pathname === "/";

export type Registration = { username: string; name?: string; email?: string; password: string };

export class Person {
  readonly jar = new CookieJar();

  /** Open the app's sign-in. Returns VoidAuth's page if it asks for a password, else where the app sent us. */
  async startAppSignIn(path = "/login"): Promise<URL> {
    return (await this.jar.follow(`${APP_URL}${path}`, (l) => onVoidAuthLogin(l) || backAtApp(l))).url;
  }

  /** Continue a VoidAuth `location` until the app's callback has run; returns the callback's status. */
  async finishAppSignIn(location: string): Promise<{ status: number; body: unknown }> {
    const { url, response } = await this.jar.follow(location, (l) => backAtApp(l));
    if (url.origin === APP_URL && url.pathname !== "/callback") return { status: 302, body: null };
    return { status: response.status, body: await response.json().catch(() => null) };
  }

  /** Sign in to the app through VoidAuth with a password. */
  async signInToApp(input: string, password: string, path = "/login") {
    const at = await this.startAppSignIn(path);
    if (!onVoidAuthLogin(at)) return { status: 302, body: null }; // already signed in to VoidAuth
    return this.finishAppSignIn(await submitLogin(this.jar, VOIDAUTH_URL, input, password));
  }

  /** Self-register on VoidAuth's sign-in page during the app's sign-in (needs SIGNUP=true). */
  async registerDuringAppSignIn(registration: Registration, path = "/login") {
    await this.startAppSignIn(path);
    const response = await this.register(registration);
    if (!response.ok) return { status: response.status, body: await response.text() };
    const { location } = (await response.json()) as { location: string };
    return this.finishAppSignIn(location);
  }

  /** Accept a VoidAuth invite link on its own, as someone clicking it in a message would. */
  async acceptInvite(link: string, registration: Omit<Registration, "email">): Promise<Response> {
    const url = new URL(link);
    // VoidAuth's invite page first starts an interaction with its internal client, like its UI does.
    const start = new URL(`${VOIDAUTH_URL}/oidc/auth`);
    start.search = new URLSearchParams({
      client_id: "auth_internal_client",
      response_type: "none",
      redirect_uri: `${VOIDAUTH_URL}/api/cb`,
      scope: "openid",
    }).toString();
    await this.jar.follow(start, onVoidAuthLogin);
    const response = await this.register({
      ...registration,
      inviteId: url.searchParams.get("invite") as string,
      challenge: url.searchParams.get("challenge") as string,
    });
    if (response.ok) {
      const { location } = (await response.json()) as { location: string };
      await this.jar.follow(location, (l) => l.pathname === "/api/cb");
    }
    return response;
  }

  register(body: Registration & { inviteId?: string; challenge?: string }): Promise<Response> {
    return this.jar.fetch(`${VOIDAUTH_URL}/api/interaction/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async signInToVoidAuth(input: string, password: string) {
    await signInToVoidAuth(this.jar, VOIDAUTH_URL, input, password);
  }

  voidauth(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Response> {
    const init: RequestInit = { method, headers: { "content-type": "application/json", ...headers } };
    if (body !== undefined) init.body = JSON.stringify(body);
    return this.jar.fetch(`${VOIDAUTH_URL}/api${path}`, init);
  }

  app(method: string, path: string, body?: unknown): Promise<Response> {
    const init: RequestInit = { method, headers: { "content-type": "application/json" } };
    if (body !== undefined) init.body = JSON.stringify(body);
    return this.jar.fetch(`${APP_URL}${path}`, init);
  }

  /** Open the sync socket with the app's device cookie and wait for its greeting. */
  openSync(): Promise<{ ws: WebSocket; hello: { sub: string } }> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${APP_URL.replace("http", "ws")}/sync`, { headers: { cookie: this.jar.header(APP_URL) } });
      ws.once("message", (data) => resolve({ ws, hello: JSON.parse(String(data)) as { sub: string } }));
      ws.once("unexpected-response", (_req, res) => reject(new Error(`sync refused: ${res.statusCode}`)));
      ws.once("error", reject);
    });
  }
}

export async function syncOnce(ws: WebSocket, message: string): Promise<unknown> {
  return new Promise((resolve) => {
    ws.once("message", (data) => resolve(JSON.parse(String(data))));
    ws.send(message);
  });
}
