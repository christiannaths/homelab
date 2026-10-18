// Sign-in through VoidAuth (ADR-PLAT-004): the authorization-code flow with PKCE, on fetch and jose
// (ADR-NOTE-014). VoidAuth is needed only while someone signs in.
import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Identity } from "./people.ts";

export interface OidcConfig {
  /** VoidAuth's issuer, `<its APP_URL>/oidc`. */
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** Notes' callback, as registered with VoidAuth. */
  redirectUri: string;
}

/** VoidAuth's group for its admins, sent in the `groups` claim. */
export const ADMIN_GROUP = "auth_admins";

interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
}

/** A started sign-in, kept in a short-lived cookie until the callback. */
export interface PendingSignIn {
  state: string;
  nonce: string;
  verifier: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function parseDiscovery(value: unknown): Discovery {
  if (!isRecord(value)) throw new Error("OIDC discovery is not an object");
  const field = (name: keyof Discovery) => {
    const found = value[name];
    if (typeof found !== "string")
      throw new Error(`OIDC discovery has no ${name}`);
    return found;
  };
  return {
    issuer: field("issuer"),
    authorization_endpoint: field("authorization_endpoint"),
    token_endpoint: field("token_endpoint"),
    userinfo_endpoint: field("userinfo_endpoint"),
    jwks_uri: field("jwks_uri"),
  };
}

function parseTokens(value: unknown): {
  id_token: string;
  access_token: string;
} {
  if (
    !isRecord(value) ||
    typeof value.id_token !== "string" ||
    typeof value.access_token !== "string"
  )
    throw new SignInError("Token response has no ID or access token");
  return { id_token: value.id_token, access_token: value.access_token };
}

const random = (bytes: number) => randomBytes(bytes).toString("base64url");

export class OidcClient {
  readonly #config: OidcConfig;
  #discovery: Promise<Discovery> | undefined;
  #jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

  constructor(config: OidcConfig) {
    this.#config = config;
  }

  #discover(): Promise<Discovery> {
    this.#discovery ??= fetch(
      `${this.#config.issuer}/.well-known/openid-configuration`,
    ).then(async (response) => {
      if (!response.ok)
        throw new Error(`OIDC discovery failed: ${response.status}`);
      return parseDiscovery(await response.json());
    });
    // A failed discovery, such as VoidAuth being down, is retried on the next sign-in.
    this.#discovery.catch(() => (this.#discovery = undefined));
    return this.#discovery;
  }

  /** Where to send the browser, and what to keep until it comes back. */
  async start(): Promise<{ url: string; pending: PendingSignIn }> {
    const { authorization_endpoint } = await this.#discover();
    const pending: PendingSignIn = {
      state: random(16),
      nonce: random(16),
      verifier: random(32),
    };
    const url = new URL(authorization_endpoint);
    url.search = new URLSearchParams({
      client_id: this.#config.clientId,
      redirect_uri: this.#config.redirectUri,
      response_type: "code",
      scope: "openid profile groups",
      state: pending.state,
      nonce: pending.nonce,
      code_challenge: createHash("sha256")
        .update(pending.verifier)
        .digest("base64url"),
      code_challenge_method: "S256",
    }).toString();
    return { url: url.href, pending };
  }

  /** Checks the callback against the pending sign-in and returns who signed in. */
  async finish(callback: URL, pending: PendingSignIn): Promise<Identity> {
    const error = callback.searchParams.get("error");
    if (error) throw new SignInError(`VoidAuth refused the sign-in: ${error}`);
    if (callback.searchParams.get("state") !== pending.state)
      throw new SignInError("Sign-in state mismatch");
    const code = callback.searchParams.get("code");
    if (!code) throw new SignInError("No authorization code");

    const discovery = await this.#discover();
    const credentials = `${encodeURIComponent(this.#config.clientId)}:${encodeURIComponent(this.#config.clientSecret)}`;
    const tokenResponse = await fetch(discovery.token_endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "authorization": `Basic ${Buffer.from(credentials).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: this.#config.redirectUri,
        code_verifier: pending.verifier,
      }),
    });
    if (!tokenResponse.ok)
      throw new SignInError(`Token exchange failed: ${tokenResponse.status}`);
    const tokens = parseTokens(await tokenResponse.json());

    this.#jwks ??= createRemoteJWKSet(new URL(discovery.jwks_uri));
    const { payload } = await jwtVerify(tokens.id_token, this.#jwks, {
      issuer: discovery.issuer,
      audience: this.#config.clientId,
    }).catch((reason: unknown) => {
      throw new SignInError(
        `Invalid ID token: ${reason instanceof Error ? reason.message : String(reason)}`,
      );
    });
    if (payload.nonce !== pending.nonce)
      throw new SignInError("Sign-in nonce mismatch");
    if (typeof payload.sub !== "string")
      throw new SignInError("ID token has no subject");

    // Profile and group claims may come only from userinfo, depending on VoidAuth's settings.
    const userinfoResponse = await fetch(discovery.userinfo_endpoint, {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userinfoResponse.ok)
      throw new SignInError(`Userinfo failed: ${userinfoResponse.status}`);
    const userinfo: unknown = await userinfoResponse.json();
    if (!isRecord(userinfo) || userinfo.sub !== payload.sub)
      throw new SignInError("Userinfo is for someone else");

    const claims = { ...userinfo, ...payload };
    const groups = Array.isArray(claims.groups) ? claims.groups : [];
    return {
      sub: payload.sub,
      name: typeof claims.name === "string" ? claims.name : null,
      isInstanceAdmin: groups.includes(ADMIN_GROUP),
    };
  }
}

/** A sign-in that failed because of what came back, not because VoidAuth was unreachable. */
export class SignInError extends Error {}
