// A stand-in for VoidAuth's OIDC side, so the server's tests run fast with nothing installed.
// The end-to-end suite in apps/notes/e2e covers the real VoidAuth.
import { createHash, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";

export interface Account {
  sub: string;
  name?: string;
  groups?: string[];
}

interface Grant {
  account: Account;
  clientId: string;
  redirectUri: string;
  nonce: string;
  challenge: string;
  sid: string | undefined;
}

export const CLIENT_ID = "notes";
export const CLIENT_SECRET = "stand-in-secret";

export class StandInVoidAuth {
  /** Who the next sign-in is for, as if they had typed their password on VoidAuth's page. */
  account: Account | undefined;
  /** Replaces the ID token's claims, to test what Notes refuses. */
  tamper:
    ((claims: Record<string, unknown>) => Record<string, unknown>) | undefined;

  /**
   * The browser's VoidAuth session id, put in ID tokens as `sid` when set. VoidAuth 1.16 never
   * sends one to clients configured from environment variables, so it is unset by default.
   */
  sid: string | undefined;

  readonly #grants = new Map<string, Grant>();
  readonly #accessTokens = new Map<string, Account>();
  #server: Server | undefined;
  #keys: { privateKey: CryptoKey; jwk: JWK } | undefined;
  issuer = "";

  async start(): Promise<this> {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    this.#keys = {
      privateKey,
      jwk: {
        ...(await exportJWK(publicKey)),
        kid: "k1",
        alg: "RS256",
        use: "sig",
      },
    };
    this.#server = createServer((req, res) => {
      this.#handle(req)
        .then(({ status, body, headers }) => {
          res
            .writeHead(status, {
              "content-type": "application/json",
              ...headers,
            })
            .end(JSON.stringify(body));
        })
        .catch((error: unknown) => res.writeHead(500).end(String(error)));
    });
    await new Promise<void>((resolve) =>
      this.#server!.listen(0, "127.0.0.1", resolve),
    );
    const address = this.#server.address();
    if (typeof address !== "object" || address === null)
      throw new Error("Stand-in VoidAuth is not listening on a TCP port");
    this.issuer = `http://127.0.0.1:${address.port}/oidc`;
    return this;
  }

  async stop(): Promise<void> {
    this.#server?.closeAllConnections();
    await new Promise<void>((resolve) => this.#server?.close(() => resolve()));
  }

  /**
   * A back-channel logout token, as VoidAuth posts to Notes when the homelab account signs out.
   * `forged` signs it with a key VoidAuth does not publish; `ageSeconds` backdates it.
   */
  async logoutToken(
    claims: Record<string, unknown>,
    { forged = false, ageSeconds = 0 } = {},
  ): Promise<string> {
    const key = forged
      ? (await generateKeyPair("RS256")).privateKey
      : this.#keys!.privateKey;
    const issuedAt = Math.floor(Date.now() / 1000) - ageSeconds;
    return new SignJWT({
      events: { "http://schemas.openid.net/event/backchannel-logout": {} },
      jti: randomBytes(8).toString("hex"),
      ...claims,
    })
      .setProtectedHeader({ alg: "RS256", kid: "k1", typ: "logout+jwt" })
      .setIssuer(this.issuer)
      .setAudience(CLIENT_ID)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + 120)
      .sign(key);
  }

  async #handle(req: IncomingMessage): Promise<{
    status: number;
    body: unknown;
    headers?: Record<string, string>;
  }> {
    const url = new URL(req.url ?? "/", this.issuer);
    const route = url.pathname.replace(/^\/oidc/, "");

    if (route === "/.well-known/openid-configuration") {
      return {
        status: 200,
        body: {
          issuer: this.issuer,
          authorization_endpoint: `${this.issuer}/auth`,
          token_endpoint: `${this.issuer}/token`,
          userinfo_endpoint: `${this.issuer}/me`,
          jwks_uri: `${this.issuer}/jwks`,
          end_session_endpoint: `${this.issuer}/session/end`,
        },
      };
    }
    if (route === "/jwks")
      return { status: 200, body: { keys: [this.#keys!.jwk] } };

    if (route === "/auth") {
      const q = url.searchParams;
      const redirect = new URL(q.get("redirect_uri") ?? "");
      if (!this.account) {
        redirect.searchParams.set("error", "access_denied");
      } else {
        const code = randomBytes(16).toString("base64url");
        this.#grants.set(code, {
          account: this.account,
          clientId: q.get("client_id") ?? "",
          redirectUri: redirect.href,
          nonce: q.get("nonce") ?? "",
          challenge: q.get("code_challenge") ?? "",
          sid: this.sid,
        });
        redirect.searchParams.set("code", code);
      }
      redirect.searchParams.set("state", q.get("state") ?? "");
      return { status: 302, body: null, headers: { location: redirect.href } };
    }

    if (route === "/token" && req.method === "POST") {
      let text = "";
      for await (const chunk of req) text += String(chunk);
      const form = new URLSearchParams(text);
      const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString(
        "base64",
      );
      if (req.headers.authorization !== `Basic ${basic}`)
        return { status: 401, body: { error: "invalid_client" } };
      const grant = this.#grants.get(form.get("code") ?? "");
      this.#grants.delete(form.get("code") ?? "");
      const verifier = form.get("code_verifier") ?? "";
      if (
        !grant ||
        grant.redirectUri !== form.get("redirect_uri") ||
        createHash("sha256").update(verifier).digest("base64url") !==
          grant.challenge
      ) {
        return { status: 400, body: { error: "invalid_grant" } };
      }
      let claims: Record<string, unknown> = {
        sub: grant.account.sub,
        nonce: grant.nonce,
      };
      if (grant.sid) claims.sid = grant.sid;
      if (this.tamper) claims = this.tamper(claims);
      const idToken = await new SignJWT(claims)
        .setProtectedHeader({ alg: "RS256", kid: "k1" })
        .setIssuer(this.issuer)
        .setAudience(grant.clientId)
        .setIssuedAt()
        .setExpirationTime("10m")
        .sign(this.#keys!.privateKey);
      const accessToken = randomBytes(16).toString("base64url");
      this.#accessTokens.set(accessToken, grant.account);
      return {
        status: 200,
        body: {
          id_token: idToken,
          access_token: accessToken,
          token_type: "Bearer",
        },
      };
    }

    if (route === "/me") {
      const account = this.#accessTokens.get(
        (req.headers.authorization ?? "").replace(/^Bearer /, ""),
      );
      if (!account) return { status: 401, body: { error: "invalid_token" } };
      return {
        status: 200,
        body: {
          sub: account.sub,
          name: account.name ?? null,
          groups: account.groups ?? [],
        },
      };
    }

    return { status: 404, body: { error: "not_found" } };
  }
}
