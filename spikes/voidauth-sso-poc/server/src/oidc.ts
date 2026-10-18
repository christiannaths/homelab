// The OIDC client side: authorization-code flow with PKCE against VoidAuth, hand-rolled on fetch
// and jose so every step is visible. The app only needs VoidAuth during sign-in.
import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { jsonObject, stringField } from "./json.ts";

export type OidcConfig = {
  issuer: string; // VoidAuth's issuer, `${APP_URL}/oidc`
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

type Discovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
};

function parseDiscovery(value: unknown): Discovery {
  return {
    issuer: stringField(value, "issuer"),
    authorization_endpoint: stringField(value, "authorization_endpoint"),
    token_endpoint: stringField(value, "token_endpoint"),
    userinfo_endpoint: stringField(value, "userinfo_endpoint"),
    jwks_uri: stringField(value, "jwks_uri"),
  };
}

/** What a sign-in hands the app: the ID token's claims and the userinfo response. */
export type SignIn = {
  idToken: JWTPayload & {
    email?: string;
    email_verified?: boolean;
    name?: string | null;
    preferred_username?: string;
    groups?: string[];
  };
  userinfo: Record<string, unknown>;
  accessToken: string;
};

/** A started sign-in, kept in a short-lived cookie until the callback. */
export type PendingSignIn = { state: string; nonce: string; verifier: string };

const base64url = (bytes: Buffer) => bytes.toString("base64url");

export class OidcClient {
  readonly #config: OidcConfig;
  #discovery: Promise<Discovery> | undefined;
  #jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

  constructor(config: OidcConfig) {
    this.#config = config;
  }

  discovery(): Promise<Discovery> {
    this.#discovery ??= fetch(
      `${this.#config.issuer}/.well-known/openid-configuration`,
    ).then(async (r) => {
      if (!r.ok) throw new Error(`OIDC discovery failed: ${r.status}`);
      const discovery: unknown = await r.json();
      return parseDiscovery(discovery);
    });
    // A failed discovery (VoidAuth down) is retried on the next sign-in.
    this.#discovery.catch(() => (this.#discovery = undefined));
    return this.#discovery;
  }

  async start(): Promise<{ url: string; pending: PendingSignIn }> {
    const { authorization_endpoint } = await this.discovery();
    const pending: PendingSignIn = {
      state: base64url(randomBytes(16)),
      nonce: base64url(randomBytes(16)),
      verifier: base64url(randomBytes(32)),
    };
    const url = new URL(authorization_endpoint);
    url.search = new URLSearchParams({
      client_id: this.#config.clientId,
      redirect_uri: this.#config.redirectUri,
      response_type: "code",
      scope: "openid profile email groups",
      state: pending.state,
      nonce: pending.nonce,
      code_challenge: base64url(
        createHash("sha256").update(pending.verifier).digest(),
      ),
      code_challenge_method: "S256",
    }).toString();
    return { url: url.href, pending };
  }

  async finish(callback: URL, pending: PendingSignIn): Promise<SignIn> {
    const error = callback.searchParams.get("error");
    if (error)
      throw new Error(
        `Sign-in failed: ${error} ${callback.searchParams.get("error_description") ?? ""}`,
      );
    if (callback.searchParams.get("state") !== pending.state)
      throw new Error("Sign-in state mismatch");
    const code = callback.searchParams.get("code");
    if (!code) throw new Error("No authorization code");

    const discovery = await this.discovery();
    const tokenResponse = await fetch(discovery.token_endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "authorization": `Basic ${Buffer.from(`${encodeURIComponent(this.#config.clientId)}:${encodeURIComponent(this.#config.clientSecret)}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: this.#config.redirectUri,
        code_verifier: pending.verifier,
      }),
    });
    if (!tokenResponse.ok)
      throw new Error(
        `Token exchange failed: ${tokenResponse.status} ${await tokenResponse.text()}`,
      );
    const tokenBody: unknown = await tokenResponse.json();
    const tokens = {
      id_token: stringField(tokenBody, "id_token"),
      access_token: stringField(tokenBody, "access_token"),
    };

    this.#jwks ??= createRemoteJWKSet(new URL(discovery.jwks_uri));
    const { payload } = await jwtVerify(tokens.id_token, this.#jwks, {
      issuer: discovery.issuer,
      audience: this.#config.clientId,
    });
    if (payload.nonce !== pending.nonce)
      throw new Error("Sign-in nonce mismatch");

    const userinfoResponse = await fetch(discovery.userinfo_endpoint, {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userinfoResponse.ok)
      throw new Error(`Userinfo failed: ${userinfoResponse.status}`);

    const userinfo: unknown = await userinfoResponse.json();
    return {
      idToken: payload,
      userinfo: jsonObject(userinfo),
      accessToken: tokens.access_token,
    };
  }
}
