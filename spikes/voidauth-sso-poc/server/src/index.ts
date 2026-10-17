// Run the stand-in app against a running VoidAuth: `npm start` after `docker compose up`.
import { createApp } from "./app.ts";
import { VoidAuthAdmin } from "./voidauth-admin.ts";

const env = (name: string, fallback?: string) => {
  const value = process.env[name] ?? fallback;
  if (value === undefined) throw new Error(`Set ${name}`);
  return value;
};

const voidauthUrl = env("VOIDAUTH_URL", "http://localhost:3000");
const baseUrl = env("APP_BASE_URL", "http://localhost:4100");
const adminUser = process.env.VOIDAUTH_ADMIN_USER;
const adminPassword = process.env.VOIDAUTH_ADMIN_PASSWORD;

const app = createApp({
  baseUrl,
  oidc: {
    issuer: `${voidauthUrl}/oidc`,
    clientId: env("NOTES_CLIENT_ID", "notes"),
    clientSecret: env("NOTES_CLIENT_SECRET", "notes-spike-secret"),
    redirectUri: `${baseUrl}/callback`,
  },
  ...(adminUser && adminPassword ? { voidauthAdmin: new VoidAuthAdmin(voidauthUrl, adminUser, adminPassword) } : {}),
});

const port = Number(new URL(baseUrl).port || 80);
app.server.listen(port, () => console.log(`Notes stand-in on ${baseUrl}, signing in through ${voidauthUrl}`));
