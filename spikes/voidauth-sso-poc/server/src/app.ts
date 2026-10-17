// A stand-in for Notes' server: signs people in through VoidAuth, keeps its own member list and
// invites, then hands out its own device cookie, which the sync WebSocket accepts.
// VoidAuth is only needed during sign-in and when creating an invite through it.
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { WebSocketServer } from "ws";
import { decideAccess, type Identity, type Invite, type Member } from "./access.ts";
import { parseCookieHeader } from "./cookies.ts";
import { DEVICE_COOKIE, Devices } from "./devices.ts";
import { OidcClient, type OidcConfig, type PendingSignIn } from "./oidc.ts";
import { ADMIN_GROUP, type VoidAuthAdmin } from "./voidauth-admin.ts";

const SIGNIN_COOKIE = "notes_signin";
const JOIN_COOKIE = "notes_join";

export type AppConfig = {
  baseUrl: string; // where this app is reached, e.g. http://localhost:4100
  oidc: OidcConfig;
  /** Set to create invites through VoidAuth for people with no account yet. */
  voidauthAdmin?: VoidAuthAdmin;
  now?: () => number;
};

export type App = {
  server: Server;
  members: Map<string, Member>;
  invites: Map<string, Invite>;
  devices: Devices;
  /** What VoidAuth sent on each person's latest sign-in, for the spike's checks. */
  lastSignIn: Map<string, { idToken: Record<string, unknown>; userinfo: Record<string, unknown>; accessToken: string }>;
};

const tempCookie = (name: string, value: string, maxAge = 600) =>
  `${name}=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string | string[]> = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers }).end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let text = "";
  for await (const chunk of req) text += String(chunk);
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

export function createApp(config: AppConfig): App {
  const oidc = new OidcClient(config.oidc);
  const devices = new Devices(config.now);
  const members = new Map<string, Member>();
  const invites = new Map<string, Invite>();
  const lastSignIn: App["lastSignIn"] = new Map();

  const memberFor = (req: IncomingMessage) => {
    const token = parseCookieHeader(req.headers.cookie).get(DEVICE_COOKIE);
    const device = devices.check(token);
    const member = device && members.get(device.sub);
    return member ? { token: token as string, member } : undefined;
  };

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", config.baseUrl);
    const cookies = parseCookieHeader(req.headers.cookie);

    if (req.method === "GET" && url.pathname === "/login") {
      const { url: authUrl, pending } = await oidc.start();
      res.writeHead(302, { location: authUrl, "set-cookie": tempCookie(SIGNIN_COOKIE, JSON.stringify(pending)) }).end();
      return;
    }

    const join = /^\/join\/([\w-]+)$/.exec(url.pathname);
    if (req.method === "GET" && join?.[1]) {
      if (!invites.has(join[1])) return send(res, 404, { error: "invite_not_found" });
      res.writeHead(302, { location: "/login", "set-cookie": tempCookie(JOIN_COOKIE, join[1]) }).end();
      return;
    }

    if (req.method === "GET" && url.pathname === "/callback") {
      const pendingCookie = cookies.get(SIGNIN_COOKIE);
      if (!pendingCookie) return send(res, 400, { error: "no_signin_in_progress" });
      const signIn = await oidc.finish(url, JSON.parse(pendingCookie) as PendingSignIn);
      const claims = { ...signIn.userinfo, ...signIn.idToken };
      const groups = Array.isArray(claims.groups) ? (claims.groups as string[]) : [];
      const who: Identity = {
        sub: String(signIn.idToken.sub),
        email: typeof claims.email === "string" ? claims.email : null,
        emailVerified: claims.email_verified === true,
        name: typeof claims.name === "string" ? claims.name : null,
        isInstanceAdmin: groups.includes(ADMIN_GROUP),
      };
      lastSignIn.set(who.sub, signIn);

      const clear = [tempCookie(SIGNIN_COOKIE, "", 0), tempCookie(JOIN_COOKIE, "", 0)];
      const decision = decideAccess(members, invites, who, cookies.get(JOIN_COOKIE));
      if (!decision.allowed) return send(res, 403, { error: "not_invited", sub: who.sub }, { "set-cookie": clear });

      // Names and emails follow VoidAuth on each sign-in.
      members.set(who.sub, { ...decision.member, email: who.email, name: who.name });
      if (decision.usedInvite) invites.delete(decision.usedInvite);
      const device = devices.issue(who.sub);
      res.writeHead(302, { location: "/", "set-cookie": [...clear, devices.cookie(device)] }).end();
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/me") {
      const signedIn = memberFor(req);
      if (!signedIn) return send(res, 401, { error: "signed_out" });
      return send(res, 200, signedIn.member);
    }

    if (req.method === "POST" && url.pathname === "/api/invites") {
      const signedIn = memberFor(req);
      if (!signedIn) return send(res, 401, { error: "signed_out" });
      if (signedIn.member.role !== "owner") return send(res, 403, { error: "owners_only" });
      const body = await readJson(req);
      const email = typeof body.email === "string" ? body.email : null;
      const invite: Invite = { token: randomBytes(16).toString("base64url"), email, createdBy: signedIn.member.sub };
      invites.set(invite.token, invite);
      // For someone with no account yet, VoidAuth's own invite creates it with this email verified.
      const accountLink =
        body.createAccount === true && email && config.voidauthAdmin
          ? (await config.voidauthAdmin.createInvitation(email)).link
          : null;
      return send(res, 201, { appLink: `${config.baseUrl}/join/${invite.token}`, accountLink });
    }

    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/plain" }).end("Notes stand-in");
      return;
    }

    send(res, 404, { error: "not_found" });
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      if (!res.headersSent) send(res, 502, { error: String(error instanceof Error ? error.message : error) });
      else res.end();
    });
  });

  // The sync socket: same host as the HTTPS responses that set the cookie, so the browser sends it.
  const sockets = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    const signedIn = new URL(req.url ?? "/", config.baseUrl).pathname === "/sync" ? memberFor(req) : undefined;
    if (!signedIn) {
      socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      return;
    }
    devices.renew(signedIn.token);
    sockets.handleUpgrade(req, socket, head, (ws) => {
      ws.send(JSON.stringify({ type: "hello", sub: signedIn.member.sub }));
      ws.on("message", (data) => {
        if (!devices.renew(signedIn.token)) return ws.close(4401, "session ended");
        ws.send(JSON.stringify({ type: "synced", echo: String(data) }));
      });
    });
  });

  return { server, members, invites, devices, lastSignIn };
}
