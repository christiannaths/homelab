// Prints the Markdown that the preview workflows post on a pull request and in a run's summary:
// the preview's addresses, the commit it runs, and its test accounts with their login links.
//
//   node tools/preview/comment.ts <name> <preview domain> <commit>
//   node tools/preview/comment.ts <name> <preview domain> --removed
import { ADMIN, APPS, PEOPLE } from "./fixtures.ts";

/** Marks the one comment the workflows create and then keep editing on a pull request. */
export const MARKER = "<!-- homelab-preview -->";

const [name, previewDomain, commit] = process.argv.slice(2);
if (!name || !previewDomain || !commit) {
  console.error(
    "Usage: node tools/preview/comment.ts <name> <preview domain> <commit>|--removed",
  );
  process.exit(1);
}
const domain = `${name}.${previewDomain}`;

if (commit === "--removed") {
  console.log(`${MARKER}
### Preview

The preview \`${name}\` was removed when this pull request closed. Reopening it brings up a fresh one.`);
} else {
  const accounts = [ADMIN, ...PEOPLE];
  console.log(`${MARKER}
### Preview

This pull request runs at **https://login.${domain}/**, on commit \`${commit}\`. It wakes in a few seconds when opened after a quiet spell.

| App | Address |
| --- | --- |
${APPS.map((app) => `| ${app.name} | https://${app.site}.${domain}/ |`).join("\n")}
| Sign-in and admin pages | https://auth.${domain}/admin |

Each link signs you in as that test account and opens their app. Add an app to open that one instead, as in https://login.${domain}/ada/encyclopedia. The passwords are public: anyone can sign in, so put nothing real here.

| Account | Login link | Password | Gets |
| --- | --- | --- | --- |
${accounts.map((account) => `| \`${account.username}\` | https://login.${domain}/${account.username} | \`${account.password}\` | ${account.gets} |`).join("\n")}

Accounts and data are kept across pushes. The **Reset preview** workflow wipes them.`);
}
