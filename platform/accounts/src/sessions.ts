// The browser's session, and the cookies Better Auth sets on its answers, which reach the browser
// only when this service passes them on (ADR-PLAT-004).
import type { BetterAuth } from "./better-auth.ts";

export type Session = NonNullable<
  Awaited<ReturnType<BetterAuth["api"]["getSession"]>>
>;

/**
 * The browser's session, never extended. Extending it here would leave the database's expiry
 * past the cookie's, since the caller has no answer to set a fresh cookie on.
 */
export function sessionOf(
  betterAuth: BetterAuth,
  headers: Headers,
): Promise<Session | null> {
  return betterAuth.api.getSession({
    headers,
    query: { disableRefresh: true },
  });
}

/**
 * The browser's session, extended when a day or more has passed since it last was, with the
 * cookies that carry the extension to the browser. The answer must pass them on.
 */
export async function extendedSessionOf(
  betterAuth: BetterAuth,
  headers: Headers,
): Promise<{ session: Session | null; cookies: Headers }> {
  const got = await betterAuth.api.getSession({ headers, returnHeaders: true });
  return { session: got.response, cookies: got.headers };
}

/** `response` with the cookies Better Auth set on `from` added. */
export function withCookiesOf(response: Response, from: Headers): Response {
  for (const cookie of from.getSetCookie())
    response.headers.append("set-cookie", cookie);
  return response;
}

/** A redirect to `location` with the cookies Better Auth set on `from`. */
export function redirectWithCookies(
  location: string,
  from: Headers,
  status: 302 | 303 = 303,
): Response {
  return withCookiesOf(
    new Response(null, { status, headers: { location } }),
    from,
  );
}
