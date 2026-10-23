// The accounts site's pages, as plain server-rendered HTML in the homelab look (packages/theme).
// They need no script, so they show at once, and follow the device's light or dark setting.
import { tokens } from "@homelab/theme/tokens";
import type { Level } from "./app-access.ts";

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
.app { display: flex; align-items: center; gap: 0.75rem; }
.app a { flex: 1; text-decoration: none; font-weight: 500; }
.app img, .app .icon { width: 2rem; height: 2rem; border-radius: 0.5rem; }
.app .icon { background: var(--hover); }
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

/** What the account page's forms say after one was sent. */
export interface AccountForms {
  changed?: string;
  nameError?: string;
  passwordError?: string;
}

export interface AccountView extends AccountForms {
  name: string;
  email: string;
  homelabAdmin: boolean;
  /** The person's apps, each named as its manifest names it. */
  apps: { name: string; url: string; icon: string | null; level: Level }[];
}

const LEVEL_NAMES: Record<Level, string> = { member: "Member", admin: "Admin" };

export function accountPage({
  name,
  email,
  homelabAdmin,
  apps,
  changed = "",
  nameError = "",
  passwordError = "",
}: AccountView): string {
  const items = apps
    .toSorted((a, b) => a.name.localeCompare(b.name))
    .map(
      (app) => `<li class="app">
  ${app.icon ? `<img src="${escape(app.icon)}" alt="">` : '<span class="icon"></span>'}
  <a href="${escape(app.url)}">${escape(app.name)}</a>
  <span class="dimmed">${LEVEL_NAMES[app.level]}</span>
</li>`,
    );
  return layout(
    "Your account",
    `<h1>${escape(name)}</h1>
<p class="dimmed">${escape(email)}</p>
${changed ? `<p role="status">${escape(changed)}</p>` : ""}
<h2>Your apps</h2>
${items.length ? `<ul aria-label="Your apps">${items.join("")}</ul>` : '<p class="dimmed">No apps yet.</p>'}
<h2>Name</h2>
<form method="post" action="/name">
  <label>Name <input name="name" value="${escape(name)}" autocomplete="name" required></label>
  <p role="alert">${escape(nameError)}</p>
  <button>Change name</button>
</form>
<h2>Password</h2>
<form method="post" action="/password">
  <label>Current password <input name="current-password" type="password" autocomplete="current-password" required></label>
  <label>New password <input name="new-password" type="password" autocomplete="new-password" minlength="8" required aria-describedby="new-password-hint"></label>
  <p id="new-password-hint" class="dimmed">At least 8 characters.</p>
  <p role="alert">${escape(passwordError)}</p>
  <button>Change password</button>
</form>
${homelabAdmin ? '<h2>Homelab admin</h2>\n<p><a href="/people">People</a></p>' : ""}
<p><a href="/sign-out">Sign out</a></p>`,
  );
}

export function peoplePage(): string {
  return layout(
    "People",
    `<h1>People</h1>
<p class="dimmed">Inviting and managing people comes here soon.</p>
<p><a href="/">Your account</a></p>`,
  );
}

export function adminsOnlyPage(): string {
  return layout(
    "Homelab admins only",
    `<h1>Only homelab admins can open this page</h1>
<p><a href="/">Your account</a></p>`,
  );
}

/** `app` is an app's subdomain, or a hostname that isn't an app's. */
export function noAccessPage(app: string, accountsUrl: string): string {
  const account = new URL("/", accountsUrl).href;
  return layout(
    "No access",
    `<h1>You don't have access to ${escape(appName(app))}</h1>
<p>Ask a homelab admin to give you access to it.</p>
<p><a href="${escape(account)}">Your account</a></p>`,
  );
}

export function tooManyAttemptsPage(view: SignInView): string {
  return signInPage({
    ...view,
    error: "Too many attempts. Wait a minute, then try again.",
  });
}

/** An app named after its subdomain, for when its manifest can't be read. */
export function appName(app: string): string {
  return app.includes(".") ? app : app.charAt(0).toUpperCase() + app.slice(1);
}
