// The account pages, as plain server-rendered HTML. Styling is out of scope for the spike: they
// only show that every page is ours to shape, with no loading screens or language picker.

const STYLE = `
:root { color-scheme: light dark; font-family: system-ui, sans-serif; }
body { max-width: 26rem; margin: 4rem auto; padding: 0 1rem; line-height: 1.5; }
form, section { display: grid; gap: 0.75rem; margin-block: 1.5rem; }
label { display: grid; gap: 0.25rem; }
input, button { font: inherit; padding: 0.5rem; }
[hidden] { display: none; }
[role="alert"]:empty { display: none; }
[role="alert"] { color: #c62828; }
`;

export function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function layout(title: string, body: string, { script = false } = {}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} · Homelab</title>
<style>${STYLE}</style>
${script ? '<script src="/assets/webauthn.js" defer></script>\n<script src="/assets/pages.js" defer></script>' : ""}
</head>
<body>
${body}
</body>
</html>`;
}

export function signInPage(returnTo: string): string {
  return layout(
    "Sign in",
    `<main id="main" data-page="sign-in" data-return-to="${escape(returnTo)}">
<h1>Sign in to Homelab</h1>
<form id="password">
  <label>Email <input name="email" type="email" autocomplete="username webauthn" required></label>
  <label>Password <input name="password" type="password" autocomplete="current-password" required></label>
  <button>Sign in</button>
</form>
<form id="totp" hidden>
  <label>Code from your authenticator app <input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" required></label>
  <button>Continue</button>
</form>
<button id="passkey" type="button">Sign in with a passkey</button>
<p id="alert" role="alert"></p>
</main>`,
    { script: true },
  );
}

export interface AccountView {
  name: string;
  email: string;
  groups: string[];
  passkeys: number;
  totp: boolean;
}

export function accountPage(view: AccountView): string {
  const apps = view.groups.length
    ? `<ul>${view.groups.map((group) => `<li>${escape(group)}</li>`).join("")}</ul>`
    : "<p>No apps yet.</p>";
  return layout(
    "Your account",
    `<main id="main" data-page="account">
<h1>${escape(view.name)}</h1>
<p id="email">${escape(view.email)}</p>
<section>
  <h2>Apps</h2>
  ${apps}
</section>
<section>
  <h2>Passkeys</h2>
  <p id="passkey-count">${view.passkeys === 1 ? "1 passkey" : `${view.passkeys} passkeys`}</p>
  <button id="add-passkey" type="button">Add a passkey</button>
</section>
<section>
  <h2>Authenticator app</h2>
  ${
    view.totp
      ? '<p id="totp-status">On</p>'
      : `<p id="totp-status">Off</p>
  <form id="enable-totp">
    <label>Password <input name="password" type="password" autocomplete="current-password" required></label>
    <button>Set up an authenticator app</button>
  </form>
  <form id="confirm-totp" hidden>
    <p>Add this to your authenticator app: <code id="totp-uri"></code></p>
    <label>Code from the app <input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" required></label>
    <button>Turn on</button>
  </form>`
  }
</section>
<p id="alert" role="alert"></p>
<p><a href="/sign-out">Sign out</a></p>
</main>`,
    { script: true },
  );
}

export function invitePage(
  invite: { email: string | null },
  error = "",
): string {
  const email = invite.email
    ? `<label>Email <input name="email" type="email" value="${escape(invite.email)}" readonly></label>`
    : '<label>Email <input name="email" type="email" autocomplete="username" required></label>';
  return layout(
    "Create your account",
    `<main id="main" data-page="invite">
<h1>Create your Homelab account</h1>
<form method="post">
  <label>Name <input name="name" autocomplete="name" required></label>
  ${email}
  <label>Password <input name="password" type="password" autocomplete="new-password" minlength="8" required></label>
  <button>Create account</button>
</form>
<p id="alert" role="alert">${escape(error)}</p>
</main>`,
  );
}

export function noAccessPage(app: string, accountsUrl: string): string {
  return layout(
    "No access",
    `<main id="main" data-page="no-access">
<h1>You don't have access to ${escape(app)}</h1>
<p>Ask the person who runs this homelab to give you access.</p>
<p><a href="${escape(accountsUrl)}/">Your account</a> · <a href="${escape(accountsUrl)}/sign-out">Sign out</a></p>
</main>`,
  );
}

export function goneInvitePage(): string {
  return layout(
    "Invite not valid",
    `<main id="main" data-page="invite-gone">
<h1>This invite can't be used</h1>
<p>It was already used or has expired. Ask for a new one.</p>
</main>`,
  );
}
