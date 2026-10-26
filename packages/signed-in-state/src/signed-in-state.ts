// An offline-first app's start-up state: who is signed in, as the app's own server answers, and
// what the device remembers from the last answer for when that server cannot be reached.

/** What the helper reads of the app's answer; a `fetch` `Response` is one. */
export interface Reply {
  readonly type: string;
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type View<T> =
  /** Asking who is here, or on the way to a sign-in page. Nothing shows. */
  | { screen: "starting" }
  /** Unreachable, with nobody remembered on this device: signing in needs a connection. */
  | { screen: "needs-connection" }
  | { screen: "signed-in"; me: T; online: boolean };

/** The parts of local storage the helper uses. */
export type DeviceStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface Device {
  /** Reading `localStorage` itself can throw (blocked site data), so it is reached through a call. */
  storage: () => DeviceStorage;
  /** Fires `online` and `offline`. */
  window: EventTarget;
  /** Fires `visibilitychange`. */
  document: EventTarget & { readonly visibilityState: string };
}

export interface Options<T> {
  /**
   * The app's own "who is here" question. A rejected promise means the server is unreachable. It
   * must not follow redirects (`redirect: "manual"`), since only a page load can sign in.
   */
  ask: () => Promise<Reply>;
  /**
   * Whether a reply means signed out. The default is the gateway's redirect, which a same-origin
   * `fetch` sees as an `opaqueredirect`; a question asked of another origin may see a readable
   * 401 instead. Any other reply that is not ok counts as unreachable: a 401 from an app with no
   * gateway in front of it would, read as signed out, start a sign-in that comes straight back.
   */
  isSignedOut?: (reply: Reply) => boolean;
  /** Reads a signed-in reply's JSON body; undefined counts as unreachable. */
  read: (body: unknown) => T | undefined;
  /** The local storage key that keeps the last signed-in answer on this device. */
  storageKey: string;
  /** Reads back what `storageKey` keeps, which is `read`'s result as JSON. Defaults to `read`. */
  readSaved?: (saved: unknown) => T | undefined;
  /** Settles once the service worker can start the app with no network. */
  offlineReady: Promise<unknown>;
  /** Leaves for sign-in by a page load that the service worker leaves to the network. */
  goToSignIn: () => void;
  /** Defaults to the browser's own. */
  device?: Device;
}

export interface SignedInState<T> {
  readonly view: View<T>;
  /** Calls `listener` whenever `view` changes; returns the call that stops it. */
  subscribe: (listener: () => void) => () => void;
  /**
   * Listens for the device's events and asks who is here; settles once the first answer shows.
   * Later calls return the first call's promise.
   */
  start: () => Promise<void>;
}

const browserDevice = (): Device => ({
  storage: () => localStorage,
  window,
  document,
});

const opaqueRedirect = (reply: Reply): boolean =>
  reply.type === "opaqueredirect";

type Answer<T> =
  | { status: "signed-in"; me: T }
  | { status: "signed-out" }
  | { status: "unreachable" };

export function createSignedInState<T>(options: Options<T>): SignedInState<T> {
  const {
    ask,
    isSignedOut = opaqueRedirect,
    read,
    storageKey,
    readSaved = read,
    offlineReady,
    goToSignIn,
  } = options;
  const device = options.device ?? browserDevice();
  const listeners = new Set<() => void>();
  let view: View<T> = { screen: "starting" };
  let started: Promise<void> | undefined;
  let latestCheck = 0;

  function show(next: View<T>): void {
    view = next;
    for (const listener of listeners) listener();
  }

  // Storage can be unavailable (a private window, blocked site data); the app then remembers
  // nobody, as on a device that has never signed in.
  function remembered(): T | undefined {
    try {
      const saved = device.storage().getItem(storageKey);
      return saved === null ? undefined : readSaved(JSON.parse(saved));
    } catch {
      return undefined;
    }
  }

  function remember(me: T | undefined): void {
    try {
      const storage = device.storage();
      if (me === undefined) storage.removeItem(storageKey);
      else storage.setItem(storageKey, JSON.stringify(me));
    } catch {
      // See remembered().
    }
  }

  async function askWho(): Promise<Answer<T>> {
    let reply: Reply;
    try {
      reply = await ask();
    } catch {
      return { status: "unreachable" };
    }
    if (isSignedOut(reply)) return { status: "signed-out" };
    if (!reply.ok) return { status: "unreachable" };
    const me = read(await reply.json().catch(() => undefined));
    return me === undefined
      ? { status: "unreachable" }
      : { status: "signed-in", me };
  }

  async function check(): Promise<void> {
    const thisCheck = ++latestCheck;
    const answer = await askWho();
    // Checks can overlap (online, then visible), and a slow older answer must not replace a newer one.
    if (thisCheck !== latestCheck) return;
    if (answer.status === "signed-in") {
      remember(answer.me);
      show({ screen: "signed-in", me: answer.me, online: true });
    } else if (answer.status === "signed-out") {
      remember(undefined);
      show({ screen: "starting" });
      // On a first visit, the app shell is still being cached; leaving now would leave a device
      // that cannot open the app offline.
      await offlineReady;
      goToSignIn();
    } else {
      const me = remembered();
      show(
        me === undefined
          ? { screen: "needs-connection" }
          : { screen: "signed-in", me, online: false },
      );
    }
  }

  // Not while starting: a check is already running, or the page is leaving for sign-in.
  async function checkAgain(): Promise<void> {
    if (view.screen !== "starting") await check();
  }

  async function listenAndCheck(): Promise<void> {
    device.window.addEventListener("online", () => void checkAgain());
    device.window.addEventListener("offline", () => {
      if (view.screen === "signed-in") show({ ...view, online: false });
    });
    // A sign-out made in another app or tab reaches this one when it is next looked at.
    device.document.addEventListener("visibilitychange", () => {
      if (device.document.visibilityState === "visible") void checkAgain();
    });
    await check();
  }

  return {
    get view() {
      return view;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start() {
      started ??= listenAndCheck();
      return started;
    },
  };
}
