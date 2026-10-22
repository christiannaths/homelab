// Reads each app's web app manifest through the gateway, which lets manifests and icons through
// without a session (ADR-PLAT-004). Home asks without anyone's cookie, so it learns an app's name
// and icon before anyone has opened the app.
import { readFile } from "node:fs/promises";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";

/** Fetches a manifest's JSON, or undefined when there is no manifest at that address. */
export type ReadManifest = (url: URL) => Promise<unknown>;

export interface GatewayAddress {
  /**
   * Where to reach the gateway instead of each app's public name, which may not resolve where Home
   * runs (such as in a container on a developer's machine). Over `http:` Home says the request
   * came over HTTPS, as the proxy that ends TLS in front of such a gateway would.
   */
  url?: URL;
  /** A PEM file holding the CA of the gateway's certificates, read when a manifest is fetched. */
  caFile?: string;
}

const TIMEOUT_MS = 5000;

export function manifestReader({ url, caFile }: GatewayAddress): ReadManifest {
  return async (manifestUrl) => {
    if (!url) {
      const response = await fetch(manifestUrl, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }).catch(() => undefined);
      if (!response?.ok) return undefined;
      // A body cut short or past the timeout is no manifest, not an error for whoever asked.
      const text = await response.text().catch(() => undefined);
      return text === undefined ? undefined : parsed(text);
    }
    // A CA file the gateway has not written yet is tried again on the next read.
    const ca = caFile ? await readFile(caFile, "utf8").catch(() => "") : "";
    const text = await new Promise<string | undefined>((resolve) => {
      const options = {
        host: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: manifestUrl.pathname,
        headers: {
          "host": manifestUrl.host,
          "x-forwarded-proto": manifestUrl.protocol.replace(":", ""),
        },
        timeout: TIMEOUT_MS,
      };
      const onResponse = (res: IncomingMessage) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => (body += chunk));
        res.on("end", () => resolve(res.statusCode === 200 ? body : undefined));
        // A body cut short closes without ending; resolving again after "end" does nothing.
        res.on("close", () => resolve(undefined));
        res.on("error", () => resolve(undefined));
      };
      const req =
        url.protocol === "https:"
          ? httpsRequest(
              {
                ...options,
                servername: manifestUrl.hostname,
                ...(ca && { ca }),
              },
              onResponse,
            )
          : httpRequest(options, onResponse);
      req.on("timeout", () => req.destroy());
      req.on("error", () => resolve(undefined));
      req.end();
    });
    return text === undefined ? undefined : parsed(text);
  };
}

function parsed(text: string): unknown {
  try {
    const value: unknown = JSON.parse(text);
    return value;
  } catch {
    return undefined;
  }
}
