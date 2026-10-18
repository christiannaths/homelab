// A tiny cookie jar for server-to-server calls and test clients, so code can walk VoidAuth's
// redirect-and-cookie sign-in without a browser. One jar per person; cookies are kept per host.

export function parseCookieHeader(
  header: string | undefined,
): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of (header ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0)
      cookies.set(
        part.slice(0, eq).trim(),
        decodeURIComponent(part.slice(eq + 1).trim()),
      );
  }
  return cookies;
}

export class CookieJar {
  readonly #byHost = new Map<string, Map<string, string>>();

  store(url: string | URL, response: Response): void {
    const host = new URL(url).host;
    const cookies = this.#byHost.get(host) ?? new Map<string, string>();
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
    this.#byHost.set(host, cookies);
  }

  header(url: string | URL): string {
    const cookies = this.#byHost.get(new URL(url).host) ?? new Map();
    return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  get(url: string | URL, name: string): string | undefined {
    return this.#byHost.get(new URL(url).host)?.get(name);
  }

  /** fetch with this jar's cookies, never following redirects itself. */
  async fetch(url: string | URL, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    const cookie = this.header(url);
    if (cookie) headers.set("cookie", cookie);
    const response = await fetch(url, { ...init, headers, redirect: "manual" });
    this.store(url, response);
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
