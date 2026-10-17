# How Hocuspocus and iOS handle sessions

**Question** ([#29](https://github.com/christiannaths/homelab/issues/29), for map [#26](https://github.com/christiannaths/homelab/issues/26)): how does Hocuspocus 4.7 authenticate a connection (a token from the provider, cookies on the WebSocket upgrade, or both), and how can the server close a connection when a session is revoked? And how do cookies and storage behave for a web app installed to the iPhone Home Screen?

**Short answer**
- Hocuspocus supports **both**. The provider sends a `token` string inside the WebSocket, once per document, and the server's `onAuthenticate` hook gets it. Every hook also gets the upgrade request's headers, so a session cookie is readable as `requestHeaders.get("cookie")`. A browser cannot add its own headers to a WebSocket, so the choice is cookie, token, or both.
- To **revoke**, the server closes that session's connections itself; Hocuspocus has no session concept. Closing one document leaves the socket open; closing the socket makes the provider reconnect and authenticate again, which then fails with a reason the app can show.
- On iPhone, a Home Screen web app has **its own cookies and storage, separate from Safari**. Signing in in Safari does not sign in the web app. WebKit **exempts the web app's own site from ITP's data deletion**, so server-set cookies and IndexedDB stay as long as their expiry and disk space allow. Cookies written by JavaScript are still capped at 7 days.

Sources: Hocuspocus 4.7.1 source as installed in this repo (`node_modules/@hocuspocus/*/src`, the version [`spikes/notes-access-sync-poc/server`](../../../../spikes/notes-access-sync-poc/server/package.json) uses), the official Hocuspocus docs (`ueberdosis/tiptap-docs` at `5b0902e`, the source of tiptap.dev/docs/hocuspocus), WebKit source (`WebKit/WebKit` main at `75bd0ae`, 2026-10-17), and Apple's WWDC23 session 10120. webkit.org, bugs.webkit.org, tiptap.dev and MDN could not be reached from this environment; where a claim rests on them, it is marked **unverified**.

## 1. How Hocuspocus authenticates a connection

### The token

- The provider option is `token: string | (() => string) | (() => Promise<string>) | null` (`provider/src/HocuspocusProvider.ts:77`). A function is called again each time the token is sent (`getToken`, line 549).
- The token is sent **inside the WebSocket, not on the upgrade**: when the socket opens, each provider sends an Auth message with the token, then starts syncing (`onOpen` → `sendToken()` → `startSync()`, `HocuspocusProvider.ts:541-546`). The socket is opened with `new WebSocketPolyfill(this.url)`, with no headers (`HocuspocusProviderWebsocket.ts:387`).
- On the server, the first message for a document is queued until the Auth message arrives. The server then runs `onConnect` and then `onAuthenticate` with `token` in the payload (`server/src/ClientConnection.ts:500-545`). The docs: "if you do not specify a token, the hook is called with an empty string" (`hocuspocus/server/hooks.mdx`, onAuthenticate).
- **It runs for every document, not every socket.** One socket carries many documents (the spike syncs the whole workspace over one), and each one is authenticated on its own (`hookPayloads[rawKey]`, `ClientConnection.ts:641-656`). The spike already depends on this ([ADR 19](../adr/0019-hocuspocus-checks-every-document-and-update.md)).

### Cookies and headers on the upgrade

- The upgrade `Request` is captured when the socket opens (`Server.ts:61-64`) and passed to every document's hooks as `request`, `requestHeaders` (a web `Headers`) and `requestParameters` (the URL query) (`ClientConnection.ts:641-656`). So `onConnect` and `onAuthenticate` can read the session cookie with `requestHeaders.get("cookie")`. The docs say v4 payloads use web-standard `Request`/`Headers`; "Read headers with `requestHeaders.get('authorization')`" (`server/hooks.mdx`, intro).
- **The headers are fixed for the socket's life.** They come from the one upgrade request, so a cookie that is changed or cleared later is not seen until the socket reconnects. The server must look the session up in its own store on each check, not just trust that a cookie is present.
- `onUpgrade` runs before the WebSocket exists and gets Node's raw `request`, `socket` and `head` (`Server.ts:99-118`). It can refuse the upgrade early, but with two catches from the source:
  - Throwing an **empty** value stops the chain and does nothing else ("enable you to respond and upgrade the request yourself", `hooks.mdx` onUpgrade). The hook has to write the HTTP response and `socket.destroy()` itself, or the socket hangs.
  - Throwing a **real error** is rethrown inside an `async` `"upgrade"` listener (`Server.ts:114-116`), which nobody awaits. That is an unhandled promise rejection, which by default stops a Node process (an inference from the code, not tested).
  - A browser shows a refused upgrade to JavaScript only as a failed socket (close code 1006), with no status or reason, and the provider retries forever by default (`maxAttempts: 0`, `HocuspocusProviderWebsocket.ts:133-140`). The app can't tell "signed out" from "offline". **Refusing in `onAuthenticate` is better**, because the reason reaches the app (next section).

### What a refusal looks like

- If `onConnect` or `onAuthenticate` throws, the server sends a **PermissionDenied** message for that document, with `error.reason ?? "permission-denied"`. It then forgets that document's state, so a retry starts fresh. **The socket and the other documents on it stay open** (`ClientConnection.ts:565-584`). The guide says a throw means "the connection to the client will be terminated" (`guides/authentication.mdx`); in v4 that means this document's connection, not the socket.
- The provider emits `authenticationFailed` with `{ reason }` and sets `isAuthenticated = false` (`HocuspocusProvider.ts:744-747`). It does not retry that document until the socket reconnects.
- If it succeeds, the hook's return value is merged into `context`, which every later hook and `connection.context` can see. That is where the session id and person go. `connectionConfig.readOnly` can be set in the hook. The guide's example uses `data.connection.readOnly`, but the v4 payload type has `connectionConfig` (`server/src/types.ts`, `onAuthenticatePayload`).

### Re-checking the token on a live connection

- `onTokenSync` (added in 3.3, `CHANGELOG.md`): the server calls `connection.requestToken()` (`server/src/Connection.ts:195-202`). The provider gets the request and runs `sendToken()` again (`common/src/auth.ts`, `readAuthMessage`), which calls the token function again. The server's `onTokenSync` hook gets the new token. If the hook throws, that document's connection is closed with `4401 Unauthorized` unless the error gives its own `code`/`reason` (`ClientConnection.ts:399-420`).
- This only works with a provider `token`; a cookie can't be re-sent on a live socket.

## 2. Closing connections when a session is revoked

Hocuspocus has no idea of a session. The app keeps the session id in `context` (returned from `onAuthenticate`) and finds the connections itself, as the spike's `applyAccessChanges` does with `connection.context.person.id` ([`server/src/server.ts`](../../../../spikes/notes-access-sync-poc/server/src/server.ts), near line 214). There are three ways to close them:

| Server call | What happens on the wire | What the provider does |
|---|---|---|
| `connection.close({ code, reason })` for each of the session's document connections (`Connection.ts:206-222`) | Sends a Hocuspocus **CLOSE message for that document only**; the socket stays open | Fires `close` with `{ code: 1000, reason }`. **The provider replaces the code with 1000** (`provider/src/MessageReceiver.ts:52-60`), so the meaning has to be in `reason`. That document stays disconnected until the socket reconnects |
| `connection.webSocket.close(4401, "session-revoked")` (`webSocket` is a public field, `Connection.ts:17`) | Closes the **whole socket**; the server cleans up every document on it (`ClientConnection.handleClose`) | The socket provider reconnects after `delay` and retries forever (`HocuspocusProviderWebsocket.ts:578-604`). On reopen each document sends its token again, `onAuthenticate` refuses, and the app gets `authenticationFailed` with the reason |
| `instance.closeConnections(documentName?)` (`Hocuspocus.ts:191-205`) | Closes every connection to a document (or to all documents) with `4205 Reset Connection` | Not tied to a person, so it does not suit revoking one session |

Practical points:
- **Close the whole socket** to revoke a device. The reconnect then carries the current cookie (or none), and the refusal arrives as `authenticationFailed` with a reason such as `"session-revoked"` that the app can act on: show "signed out", stop syncing, and keep the local data ([ADR 11](../adr/0011-local-password-accounts.md)).
- **Stop the retry loop** on that reason: call `disconnect()` on the `HocuspocusProviderWebsocket` (sets `shouldConnect = false`, `HocuspocusProviderWebsocket.ts:521`). Otherwise a revoked device reconnects and is refused every `delay` milliseconds, forever.
- To catch a session that is revoked or expires while nothing triggers a close, the server can check it in `beforeHandleMessage` or `beforeSync` (the spike already reviews every update in `beforeSync`), or call `requestToken()` on a timer.

## 3. Cookies and storage in an iPhone Home Screen web app

### A separate cookie jar and storage

- Apple, WWDC23 session 10120 "What's new in web apps": "Home Screen web apps have a standalone, app-like experience on iOS, with separate cookies and storage from the browser." For Mac web apps added to the Dock, "we copy website cookies when a web app on Mac is added to the Dock … From that point on, cookies are separate between Safari and the web app", and "local storage is not copied". The session says this copying happens on **Mac**; it does not say iOS copies cookies when a site is added to the Home Screen ([developer.apple.com/videos/play/wwdc2023/10120](https://developer.apple.com/videos/play/wwdc2023/10120/)).
- So, on iPhone: **plan for a sign-in inside the installed app**. A session made in Safari does not carry over. Signing out in one does not sign out the other. Each is a separate device as far as the server is concerned.
- WebKit bug 181849, "'Add to homescreen' apps don't share storage with Safari", is said to be closed as by design (**unverified**: seen in search results only; bugs.webkit.org unreachable).

### How long cookies and storage last

- **The web app's own site is exempt from ITP's website-data deletion.** In WebKit's ITP store, the deletion pass first skips any domain in `domainsExemptFromWebsiteDataDeletion()`, with the comment "Domains permanently configured to be exempt. This can be home screen web applications, app-bound domains, or similar." That set includes `m_standaloneApplicationDomain` (and also `m_persistedDomains`) (`Source/WebKit/NetworkProcess/Classifier/ResourceLoadStatisticsStore.cpp:804-817, 2916-2919`). The domain is set from the data store's `standaloneApplicationURL` (`UIProcess/WebsiteData/Cocoa/WebsiteDataStoreCocoa.mm:234`).
  - For context, the deletion it skips removes "all script-written storage" (IndexedDB, localStorage, service worker caches and the like) for a site without recent user interaction (`shouldRemoveAllButCookiesFor`, same file, about line 2854). Its windows are 7 or 30 days of browser use (`operatingDatesWindowShort/Long`, line 74). This is the well-known "7-day cap" from WebKit's March 2020 post "Full Third-Party Cookie Blocking and More", which also said "Web applications added to the home screen are not part of Safari and thus have their own counter of days of use" (**unverified**: webkit.org unreachable, wording from search results).
- **Cookies written by JavaScript are capped at 7 days** (`clientSideCookiesAgeCapTime { 24_h * 7 }`, 24 hours after some link-decorated navigations; `ResourceLoadStatisticsStore.h:231-232`, applied through `setAgeCapForClientSideCookies`). A WebKit engineer is quoted as saying the Home Screen app's cap covers only JavaScript cookies and cookies from third-party CNAME-cloaked responses (**unverified**, search results only). **Set the session cookie from the server with `HttpOnly`**, never with `document.cookie`.
- **Cookies set through a different host are capped too.** WebKit records the CNAME and IP address that served each response (`NetworkDataTaskCocoa::updateFirstPartyInfoForSession`, `NetworkDataTaskCocoa.mm:171-187`) for its "third-party cloaking" cookie policy. The 7-day cap on server-set cookies from a CNAME-cloaked or different-IP host is described in WebKit posts and vendor write-ups (**unverified** beyond the code that records them). Serve the web app, the sign-in API and the sync WebSocket from **one host**, and this does not apply.
- **Storage quota.** From Safari 17 / iOS 17, the per-origin quota is a share of the disk ("up to 60% … for browser apps and up to 15% for other apps") and `navigator.storage.persist()` is supported, from WebKit's "Updates to Storage Policy" (**unverified**: webkit.org/blog/14403 unreachable, search excerpt only). A persisted origin is exempt from ITP deletion, as `m_persistedDomains` above shows. A bug report says `persist()` returned `false` in Safari 17 (bug 271401, **unverified**).
- **Session cookies.** A cookie without `Expires`/`Max-Age` is a session cookie. There are reports of session cookies being reset randomly in Home Screen web apps: WebKit bug 272325, "REGRESSION (iOS 17.x): Session cookies being reset randomly in a Home Screen web app", filed April 2024, status NEW when last seen (**unverified**: search results only). **Give the session cookie an explicit `Max-Age`** and don't rely on the web app's process staying alive.

### SameSite and Secure

- WebKit enforces SameSite on WebSocket upgrades: "Enforcing SameSite cookie policy for WebSocket upgrade requests, independently of ITP" (`updateTaskWithFirstPartyForSameSiteCookies`). Third-party cookie blocking also applies to the upgrade (`NetworkProcess/cocoa/WebSocketTaskCocoa.mm:69-78`). When the page and the `wss://` URL are on the same site, the request is same-site, and `SameSite=Lax` or `Strict` cookies are sent. A cross-site sync host would have its cookies blocked.
- `Secure` needs HTTPS, which the PWA needs anyway (a secure context, the "HTTPS on the homelab" item on map #26). Use `wss://` on the same host.

### Known WebSocket cookie problems in WebKit

- An Apple Developer Forums post (thread 104488, June 2018, no replies) says Safari on macOS and iOS did not send back an `HttpOnly; Secure; SameSite=Strict` cookie **that had been set on the WebSocket's own 101 response**, and that removing `HttpOnly` made it work ([developer.apple.com/forums/thread/104488](https://developer.apple.com/forums/thread/104488)). WebKit bug 184102 ("cookie set during the WebSocket handshake is not sent in a subsequent WebSocket connection") seems to be the same problem (**unverified**). **Don't set or refresh the session cookie on the upgrade response**; set it from a normal HTTPS sign-in response.
- No primary source found on cookies for WebSocket connections from standalone web apps specifically. The WebKit code above uses the same cookie storage and policy for the upgrade as for other requests from the web app.

## What this means for the Sessions ticket

1. Sign in over HTTPS; the server sets a long-lived `HttpOnly; Secure; SameSite=Lax` (or `Strict`) cookie with an explicit `Max-Age`, on the same host as the app and the sync socket.
2. In `onAuthenticate` (every document), read the cookie from `requestHeaders`, look the session up in SQLite, put `{ sessionId, person }` in `context`, and throw `{ reason: "session-revoked" }` (or `"signed-out"`) if it is gone.
3. To revoke a session, close the socket of every connection whose `context.sessionId` matches; on `authenticationFailed` with that reason, the app shows "signed out", calls `disconnect()` on the socket provider and keeps its local data.
4. Using a provider `token` as well (for example a session id that JavaScript can read) adds `onTokenSync` re-checks, but that token would sit in script-readable storage. The cookie alone is enough for the checks above; this is a choice for the Sessions ticket.
5. On iPhone, expect one sign-in in Safari and another in the installed app. Server-set cookies and IndexedDB should last in the installed app; JavaScript cookies won't.
