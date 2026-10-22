// The one-click login links of a homelab made for trying by hand, such as `npm run dev` or a
// preview: `login.<domain>/<username>[/<app>]` signs the browser in as that test account and opens
// their app, so trying the apps as each person needs no typing. A real install has no such site.
import type { RequestListener } from "node:http";
import {
  VoidAuthClient,
  type App,
  type VoidAuthAddress,
} from "@homelab/voidauth-fixtures";

export interface Account {
  username: string;
  password: string;
  groups: string[];
}

export interface LoginLinks {
  /** The domain the apps live under, such as `homelab.localhost`. */
  domain: string;
  /** The port browsers reach the gateway on, left out of addresses when it is 443. */
  port: number;
  /** Where the handler reaches VoidAuth to sign in. */
  voidauth: VoidAuthAddress;
  /** The accounts a link can sign in as, with the passwords VoidAuth knows them by. */
  accounts: Account[];
  apps: App[];
}

/**
 * The login site's handler, which the gateway passes `login.<domain>` to. It signs in with the
 * account's password as a browser would, then hands that browser VoidAuth's session cookie.
 */
export function loginLinks({
  domain,
  port,
  voidauth,
  accounts,
  apps,
}: LoginLinks): RequestListener {
  const address = (host: string) =>
    port === 443 ? `https://${host}/` : `https://${host}:${port}/`;
  return (req, res) => {
    const [username, appName] = new URL(req.url ?? "/", "http://login").pathname
      .split("/")
      .filter(Boolean);
    const account = accounts.find(
      (candidate) => candidate.username === username,
    );
    if (!account) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(
        accounts
          .map(
            (candidate) =>
              `<p><a href="/${candidate.username}">Sign in as ${candidate.username}</a></p>`,
          )
          .join("\n"),
      );
      return;
    }
    const app =
      apps.find((candidate) => candidate.host === `${appName}.${domain}`) ??
      apps.find((candidate) =>
        candidate.groups.some((group) => account.groups.includes(group)),
      );
    const browser = new VoidAuthClient(voidauth);
    browser
      .signIn(account)
      .then((signedIn) => {
        if (!signedIn)
          throw new Error(`VoidAuth refused ${username}'s password`);
        res.writeHead(302, {
          "location": address(app?.host ?? `auth.${domain}`),
          "set-cookie": browser.sessionCookies(),
        });
        res.end();
      })
      .catch((error: unknown) => {
        res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        res.end(String(error));
      });
  };
}
