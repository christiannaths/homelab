import { request } from "node:https";
import { stringField } from "./json.ts";

/** Where VoidAuth is reached: through a gateway on this machine, without DNS. */
export interface VoidAuthAddress {
  /** VoidAuth's public address, such as `https://auth.homelab.localhost:8443`. */
  url: string;
  /** The certificate of the CA that signs the gateway's certificates, in PEM. */
  ca: string;
}

interface Response {
  status: number;
  location: string | undefined;
  text: string;
}

/** One browser's worth of cookies on VoidAuth, checked against the gateway's CA. */
export class VoidAuthClient {
  readonly address: VoidAuthAddress;
  readonly #origin: URL;
  readonly #cookies = new Map<string, string>();
  readonly #setCookies: string[] = [];

  constructor(address: VoidAuthAddress) {
    this.address = address;
    this.#origin = new URL(address.url);
  }

  async waitUntilUp(): Promise<void> {
    for (let i = 0; i < 120; i++) {
      const response = await this.#send("GET", "/api/public/config").catch(
        () => null,
      );
      if (response?.status === 200) return;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error("VoidAuth did not answer through the gateway in time");
  }

  /** Begins signing in, as an app's redirect to VoidAuth does. */
  async startInteraction(): Promise<void> {
    const start = new URLSearchParams({
      client_id: "auth_internal_client",
      response_type: "none",
      redirect_uri: `${this.#origin.origin}/api/cb`,
      scope: "openid",
    });
    await this.#send("GET", `/oidc/auth?${start}`);
  }

  /**
   * Signs in with a password and follows the redirects that set VoidAuth's session cookie. False
   * when VoidAuth refuses the password.
   */
  async signIn(account: {
    username: string;
    password: string;
  }): Promise<boolean> {
    await this.startInteraction();
    const response = await this.#send("POST", "/api/interaction/login", {
      input: account.username,
      password: account.password,
      remember: false,
    });
    if (response.status === 401) return false;
    if (response.status !== 200)
      throw new Error(`Signing in failed: ${response.status} ${response.text}`);
    let next: string | undefined = stringField(
      JSON.parse(response.text),
      "location",
    );
    for (let i = 0; next && i < 10; i++) {
      const url = new URL(next, this.#origin);
      if (url.origin !== this.#origin.origin) break;
      next = (await this.#send("GET", url.pathname + url.search)).location;
    }
    return true;
  }

  /**
   * VoidAuth's latest session cookie and its signature, as it set them: on the parent domain, so
   * every app's hostname receives them.
   */
  sessionCookies(): string[] {
    const latest = new Map<string, string>();
    for (const cookie of this.#setCookies) {
      const name = cookie.slice(0, cookie.indexOf("="));
      if (name.startsWith("x-voidauth-session")) latest.set(name, cookie);
    }
    return [...latest.values()];
  }

  /** A call to VoidAuth's JSON API, as its own web UI makes. Fails with `what` from 300 up. */
  async json(
    what: string,
    method: string,
    route: string,
    body?: unknown,
  ): Promise<unknown> {
    const response = await this.#send(method, route, body);
    if (response.status >= 300)
      throw new Error(`${what} failed: ${response.status} ${response.text}`);
    return response.text ? JSON.parse(response.text) : null;
  }

  #send(method: string, route: string, body?: unknown): Promise<Response> {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const headers: Record<string, string> = { host: this.#origin.host };
    if (payload !== undefined) headers["content-type"] = "application/json";
    if (this.#cookies.size > 0)
      headers.cookie = [...this.#cookies]
        .map(([name, value]) => `${name}=${value}`)
        .join("; ");
    return new Promise((resolve, reject) => {
      const req = request(
        {
          // The gateway is on this machine; its hostname need not resolve.
          host: "127.0.0.1",
          port: this.#origin.port || 443,
          servername: this.#origin.hostname,
          ca: this.address.ca,
          method,
          path: route,
          headers,
        },
        (res) => {
          for (const cookie of res.headers["set-cookie"] ?? []) {
            this.#setCookies.push(cookie);
            const [pair = ""] = cookie.split(";");
            const at = pair.indexOf("=");
            this.#cookies.set(pair.slice(0, at), pair.slice(at + 1));
          }
          let text = "";
          res.setEncoding("utf8");
          res.on("data", (chunk: string) => (text += chunk));
          res.on("end", () =>
            resolve({
              status: res.statusCode ?? 0,
              location: res.headers.location,
              text,
            }),
          );
        },
      );
      req.on("error", reject);
      req.end(payload);
    });
  }
}
