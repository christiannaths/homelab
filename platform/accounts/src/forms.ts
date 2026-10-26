// The accounts site's pages post plain HTML forms, which any other website could post too, with
// the browser's session cookie. The session cookie is on the parent domain, so even a homelab
// app's page on a sibling subdomain counts as another site here.
import type { Context } from "hono";

/**
 * Whether a form post came from one of this site's own pages. Browsers send Origin on every
 * POST, and Sec-Fetch-Site where they support it; either one naming another site refuses it.
 */
export function fromOurPages(c: Context, accountsUrl: string): boolean {
  const fetchSite = c.req.header("sec-fetch-site");
  return (
    c.req.header("origin") === new URL(accountsUrl).origin &&
    (fetchSite === undefined || fetchSite === "same-origin")
  );
}

/** A form's text fields, with an empty string for any field that is missing. */
export async function formFields(
  c: Context,
): Promise<(name: string) => string> {
  const form = await c.req.parseBody();
  return (name) => {
    const value = form[name];
    return typeof value === "string" ? value : "";
  };
}
