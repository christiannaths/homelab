// A stand-in for the platform in front of Notes (ADR-PLAT-009): it signs a browser in as a test
// person by adding the identity headers to every request, WebSocket upgrades included, and sends
// a signed-out browser to a stand-in sign-in page, as the real gateway and accounts service do.
// Notes' tests run against it so that a change to the platform can't break them; the real
// platform and Notes are tested together in platform/e2e.
import {
  createServer,
  request as forward,
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type Server,
  type ServerResponse,
} from "node:http";
import { connect, type Socket } from "node:net";
import { identityHeaders, type Identity } from "@homelab/identity";

/** Which test person a browser signed in as. */
export const SESSION_COOKIE = "front-door.person";

// Chromium treats *.localhost as a secure context, so the service worker registers over plain
// HTTP and no certificate is needed. It refuses a cookie for a parent `localhost` domain, though,
// so the sign-in page is on the same host as Notes, on a port of its own: a cookie is sent to
// every port of its host, and the other origin keeps Notes' service worker off the sign-in page.
const HOST = "notes.localhost";

export interface FrontDoorOptions {
  /** The Notes server on this machine. */
  notesPort: number;
  /** The people the sign-in page offers. */
  people: readonly Identity[];
}

export interface FrontDoor {
  /** Notes, as a browser opens it. */
  readonly notesUrl: string;
  /** The origin of the stand-in sign-in page, at `/sign-in`. */
  readonly signInUrl: string;
  /** Stops answering, as an unreachable homelab does. */
  stop(): Promise<void>;
  /** Answers again, on the same ports. Does nothing while it is answering. */
  start(): Promise<void>;
}

export async function startFrontDoor({
  notesPort,
  people,
}: FrontDoorOptions): Promise<FrontDoor> {
  const personOn = (request: IncomingMessage) => {
    const id = cookie(request, SESSION_COOKIE);
    return people.find((person) => person.id === id);
  };
  const signInFor = (request: IncomingMessage) =>
    `${signIn.url()}/sign-in?rd=${encodeURIComponent(`${app.url()}${request.url ?? "/"}`)}`;

  /** Upgraded sockets, which closeAllConnections() leaves open. */
  const upgrades = new Set<Socket>();

  const app = listener(
    createServer((request, response) => {
      const person = personOn(request);
      // The manifest and icons are readable signed out (ADR-PLAT-009).
      if (person || isPublic(request.url)) proxy(request, response, person);
      else response.writeHead(302, { location: signInFor(request) }).end();
    }).on("upgrade", (request: IncomingMessage, socket: Socket, head) => {
      const person = personOn(request);
      if (!person) {
        socket.end(
          `HTTP/1.1 302 Found\r\nLocation: ${signInFor(request)}\r\nConnection: close\r\n\r\n`,
        );
        return;
      }
      upgrades.add(socket);
      socket.once("close", () => upgrades.delete(socket));
      const upstream = connect(notesPort, "127.0.0.1", () => {
        const lines = [`${request.method} ${request.url} HTTP/1.1`];
        for (const [name, value] of Object.entries(headersFor(request, person)))
          for (const one of [value].flat()) lines.push(`${name}: ${one}`);
        upstream.write(`${lines.join("\r\n")}\r\n\r\n`);
        upstream.write(head);
        upstream.pipe(socket).pipe(upstream);
      });
      upstream.once("error", () => socket.destroy());
      socket.once("error", () => upstream.destroy());
      socket.once("close", () => upstream.destroy());
    }),
    () => {
      for (const socket of upgrades) socket.destroy();
    },
  );

  const signIn = listener(
    createServer((request, response) => {
      const url = new URL(request.url ?? "/", signIn.url());
      if (url.pathname !== "/sign-in") response.writeHead(404).end();
      else if (request.method === "POST")
        void formFrom(request).then((form) => {
          const person = people.find(({ id }) => id === form.get("person"));
          const back = form.get("rd") ?? "";
          response
            .writeHead(303, {
              "set-cookie": `${SESSION_COOKIE}=${encodeURIComponent(person?.id ?? "")}; Path=/; HttpOnly; SameSite=Lax`,
              // Only back to Notes, as the accounts service goes back only to the homelab's apps.
              "location": back.startsWith(`${app.url()}/`) ? back : app.url(),
            })
            .end();
        });
      else
        response
          .writeHead(200, { "content-type": "text/html; charset=utf-8" })
          .end(signInPage(people, url.searchParams.get("rd") ?? ""));
    }),
  );

  function proxy(
    request: IncomingMessage,
    response: ServerResponse,
    person: Identity | undefined,
  ): void {
    const upstream = forward(
      {
        host: "127.0.0.1",
        port: notesPort,
        method: request.method,
        path: request.url,
        headers: headersFor(request, person),
      },
      (answer) => {
        response.writeHead(answer.statusCode ?? 502, answer.headers);
        answer.pipe(response);
      },
    );
    upstream.once("error", () => response.writeHead(502).end());
    request.pipe(upstream);
  }

  await app.start();
  await signIn.start();
  return {
    notesUrl: app.url(),
    signInUrl: signIn.url(),
    async stop() {
      await Promise.all([app.stop(), signIn.stop()]);
    },
    async start() {
      await app.start();
      await signIn.start();
    },
  };
}

/** A server that keeps the free port it was first given across stops and starts. */
function listener(server: Server, onStop = () => {}) {
  let port = 0;
  return {
    url: () => `http://${HOST}:${port}`,
    start: () =>
      new Promise<void>((resolve, reject) => {
        if (server.listening) return resolve();
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => {
          server.off("error", reject);
          const address = server.address();
          if (typeof address !== "object" || address === null)
            return reject(new Error("The front door has no TCP port"));
          port = address.port;
          resolve();
        });
      }),
    stop: () =>
      new Promise<void>((resolve) => {
        if (!server.listening) return resolve();
        server.close(() => resolve());
        server.closeAllConnections();
        onStop();
      }),
  };
}

/**
 * The request's headers for Notes: any identity headers the browser sent are dropped, as the
 * gateway drops them, and the signed-in person's are added.
 */
function headersFor(
  request: IncomingMessage,
  person: Identity | undefined,
): OutgoingHttpHeaders {
  const headers: OutgoingHttpHeaders = Object.fromEntries(
    Object.entries(request.headers).filter(
      ([name]) => !name.startsWith("remote-"),
    ),
  );
  return person ? { ...headers, ...identityHeaders(person) } : headers;
}

// Matched on the cleaned path, so /icons/../ is signed in like any other path, as at the gateway.
function isPublic(path = "/"): boolean {
  const { pathname } = new URL(path, "http://front-door");
  return pathname === "/manifest.webmanifest" || pathname.startsWith("/icons/");
}

function signInPage(people: readonly Identity[], rd: string): string {
  const buttons = people
    .map(
      (person) =>
        `<button name="person" value="${escape(person.id)}">Sign in as ${escape(person.name ?? person.id)}</button>`,
    )
    .join("");
  return `<!doctype html><title>Sign in</title><form method="post" action="/sign-in"><input type="hidden" name="rd" value="${escape(rd)}">${buttons}</form>`;
}

function cookie(request: IncomingMessage, name: string): string | undefined {
  for (const pair of (request.headers.cookie ?? "").split(";")) {
    const [key, ...value] = pair.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

async function formFrom(request: IncomingMessage): Promise<URLSearchParams> {
  let body = "";
  for await (const chunk of request) body += String(chunk);
  return new URLSearchParams(body);
}

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
