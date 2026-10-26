// Which screen shows, decided from the last answer kept on this device and whether the server
// can be reached, as in Notes.
import { checkMe, parseMe, SIGN_IN_PATH, type Me } from "./api.ts";

export type View =
  /** Checking who is signed in, or on the way to a sign-in page. Nothing shows. */
  | { screen: "starting" }
  | { screen: "needs-connection" }
  | { screen: "home"; me: Me; online: boolean };

const KEPT_KEY = "home.me";

// Storage can be unavailable (a private window, blocked site data); Home then keeps nothing.
function kept(): Me | undefined {
  try {
    return parseMe(JSON.parse(localStorage.getItem(KEPT_KEY) ?? "null"));
  } catch {
    return undefined;
  }
}

function keep(me: Me | undefined): void {
  try {
    if (me) localStorage.setItem(KEPT_KEY, JSON.stringify(me));
    else localStorage.removeItem(KEPT_KEY);
  } catch {
    // See kept().
  }
}

export class Home {
  #view: View = { screen: "starting" };
  readonly #listeners = new Set<() => void>();
  readonly #offlineReady: Promise<unknown>;

  /** `offlineReady` settles once the service worker can start Home with no network. */
  constructor(offlineReady: Promise<unknown>) {
    this.#offlineReady = offlineReady;
  }

  get view(): View {
    return this.#view;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  async start(): Promise<void> {
    window.addEventListener("online", () => void this.#check());
    window.addEventListener("offline", () => {
      if (this.#view.screen === "home")
        this.#show({ ...this.#view, online: false });
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void this.#check();
    });
    await this.#check();
  }

  async #check(): Promise<void> {
    const result = await checkMe();
    if (result.status === "signed-in") {
      keep(result.me);
      this.#show({ screen: "home", me: result.me, online: true });
    } else if (result.status === "signed-out") {
      keep(undefined);
      this.#show({ screen: "starting" });
      // On a first visit, the app shell is still being cached; leaving now would leave a device
      // that cannot open Home offline.
      await this.#offlineReady;
      location.replace(SIGN_IN_PATH);
    } else {
      const me = kept();
      this.#show(
        me
          ? { screen: "home", me, online: false }
          : { screen: "needs-connection" },
      );
    }
  }

  #show(view: View): void {
    this.#view = view;
    for (const listener of this.#listeners) listener();
  }
}
