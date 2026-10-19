// The page asks the app who is signed in. A redirect means VoidAuth no longer lets this browser
// in (the person signed out, perhaps in another app), so the page forgets what it kept on the
// device and reloads, which takes the person to VoidAuth. What the app keeps for offline use
// lives in the Cache API, where the service worker can clear it too.
const who = document.getElementById("who");
const network = document.getElementById("network");
const sync = document.getElementById("sync");
const signOut = document.getElementById("sign-out");

await navigator.serviceWorker.register("/sw.js");

/**
 * @typedef {{ username: string, name: string | null, level: string }} Person
 * @typedef {{ signOutUrl: string, person: Person }} Me
 * @type {Me | null}
 */
let me = null;
try {
  const response = await fetch("/api/me", { redirect: "manual" });
  if (response.type === "opaqueredirect" || !response.ok) {
    await forget();
    location.reload();
  } else {
    me = asMe(/** @type {unknown} */ (await response.json()));
    const data = await caches.open("data");
    await data.put("/offline/me", new Response(JSON.stringify(me)));
    network.textContent = "Online";
    connect();
  }
} catch {
  // Offline: show what this device kept from the last time it was online.
  const kept = await caches.match("/offline/me");
  me = kept ? asMe(/** @type {unknown} */ (await kept.json())) : null;
  network.textContent = "Offline";
}

if (me) {
  const { person } = me;
  who.textContent = `Signed in as ${person.name ?? person.username} (${person.username}), ${person.level}`;
  signOut.href = me.signOutUrl;
  signOut.hidden = false;
}

function connect() {
  const socket = new WebSocket(`wss://${location.host}/sync`);
  socket.addEventListener("message", (event) => {
    const hello = /** @type {unknown} */ (JSON.parse(String(event.data)));
    if (typeof hello === "object" && hello !== null && "hello" in hello)
      sync.textContent = `Sync connected as ${String(hello.hello)}`;
  });
  socket.addEventListener("error", () => {
    sync.textContent = "Sync refused";
  });
}

/**
 * The app's own answer, checked only as far as the page relies on it.
 * @param {unknown} value
 * @returns {Me | null}
 */
function asMe(value) {
  if (typeof value !== "object" || value === null) return null;
  if (!("signOutUrl" in value) || typeof value.signOutUrl !== "string")
    return null;
  if (
    !("person" in value) ||
    typeof value.person !== "object" ||
    value.person === null
  )
    return null;
  const { person } = value;
  const username = "username" in person ? person.username : undefined;
  const name = "name" in person ? person.name : undefined;
  const level = "level" in person ? person.level : undefined;
  if (typeof username !== "string" || typeof level !== "string") return null;
  return {
    signOutUrl: value.signOutUrl,
    person: { username, name: typeof name === "string" ? name : null, level },
  };
}

async function forget() {
  for (const key of await caches.keys()) await caches.delete(key);
}
