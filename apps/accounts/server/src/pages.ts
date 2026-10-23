// The accounts site's pages, as plain server-rendered HTML in the homelab look (packages/theme).
// They need no script, so they show at once, and follow the device's light or dark setting.
import { tokens } from "@homelab/theme/tokens";
import type { Grants } from "./app-access.ts";

const STYLE = `
:root {
  color-scheme: light dark;
  --surface: ${tokens.surface.light};
  --text: ${tokens.text.light};
  --dimmed: ${tokens.dimmed.light};
  --border: ${tokens.border.light};
  --hover: ${tokens.hover.light};
  --button: ${tokens.text.light};
  --button-text: ${tokens.surface.light};
  --error: #c92a2a;
}
@media (prefers-color-scheme: dark) {
  :root {
    --surface: ${tokens.surface.dark};
    --text: ${tokens.text.dark};
    --dimmed: ${tokens.dimmed.dark};
    --border: ${tokens.border.dark};
    --hover: ${tokens.hover.dark};
    --button: ${tokens.text.dark};
    --button-text: ${tokens.surface.dark};
    --error: #ff8787;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--surface);
  color: var(--text);
  font-family: ${tokens.font};
  line-height: 1.5;
}
main { max-width: 24rem; margin: 0 auto; padding: 4rem 1rem; }
h1 { font-size: 1.5rem; margin: 0 0 1.5rem; }
h2 { font-size: 1rem; margin: 2rem 0 0.5rem; }
p { margin: 0 0 1rem; }
form { display: grid; gap: 1rem; }
label { display: grid; gap: 0.25rem; font-size: 0.875rem; font-weight: 500; }
input {
  font: inherit;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: var(--surface);
  color: var(--text);
}
button {
  font: inherit;
  font-weight: 600;
  padding: 0.5rem 0.75rem;
  border: 0;
  border-radius: 0.5rem;
  background: var(--button);
  color: var(--button-text);
  cursor: pointer;
}
a { color: inherit; }
ul { padding: 0; list-style: none; }
li { padding: 0.5rem 0; border-bottom: 1px solid var(--border); }
.dimmed { color: var(--dimmed); }
[role="alert"] { color: var(--error); }
[role="alert"]:empty { display: none; }
`;

export function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" media="(prefers-color-scheme: light)" content="${tokens.surface.light}">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="${tokens.surface.dark}">
<title>${escape(title)} · Homelab</title>
<style>${STYLE}</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>`;
}

export interface SignInView {
  returnTo: string;
  email?: string;
  error?: string;
}

export function signInPage({ returnTo, email = "", error = "" }: SignInView) {
  return layout(
    "Sign in",
    `<h1>Sign in to Homelab</h1>
<form method="post" action="/sign-in">
  <input type="hidden" name="return-to" value="${escape(returnTo)}">
  <label>Email <input name="email" type="email" value="${escape(email)}" autocomplete="username" required ${email ? "" : "autofocus"}></label>
  <label>Password <input name="password" type="password" autocomplete="current-password" required ${email ? "autofocus" : ""}></label>
  <p id="alert" role="alert">${escape(error)}</p>
  <button>Sign in</button>
</form>`,
  );
}

export interface AccountView {
  name: string;
  email: string;
  grants: Grants;
}

export function accountPage({ name, email, grants }: AccountView): string {
  const apps = Object.entries(grants);
  return layout(
    "Your account",
    `<h1>${escape(name)}</h1>
<p class="dimmed">${escape(email)}</p>
<h2>Your apps</h2>
${
  apps.length
    ? `<ul>${apps.map(([app, level]) => `<li>${escape(appName(app))}${level === "admin" ? ' <span class="dimmed">admin</span>' : ""}</li>`).join("")}</ul>`
    : '<p class="dimmed">No apps yet.</p>'
}
${signOutForm("/sign-out")}`,
  );
}

/** A POST, since a link or an image on any site could otherwise sign the browser out. */
function signOutForm(action: string): string {
  return `<form method="post" action="${escape(action)}"><button>Sign out</button></form>`;
}

/** `app` is an app's subdomain, or a hostname that isn't an app's. */
export function noAccessPage(app: string, accountsUrl: string): string {
  const account = new URL("/", accountsUrl).href;
  return layout(
    "No access",
    `<h1>You don't have access to ${escape(appName(app))}</h1>
<p>Ask a homelab admin to give you access to it.</p>
<p><a href="${escape(account)}">Your account</a></p>
${signOutForm(new URL("/sign-out", accountsUrl).href)}`,
  );
}

export function tooManyAttemptsPage(view: SignInView): string {
  return signInPage({
    ...view,
    error: "Too many attempts. Wait a minute, then try again.",
  });
}

/** An app named after its subdomain: this service reads no app's manifest. */
function appName(app: string): string {
  return app.includes(".") ? app : app.charAt(0).toUpperCase() + app.slice(1);
}
