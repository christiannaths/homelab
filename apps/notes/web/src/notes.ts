// Which screen shows, decided from three things: the person as of the last session check, whether
// a sign-out is waiting, and whether the server can be reached (issue #47).
import {
  checkSession,
  SIGN_IN_PATH,
  signOutOfNotes,
  type Person,
} from "./api.ts";
import {
  rememberedPerson,
  rememberPerson,
  setSignOutWaiting,
  signOutWaiting,
} from "./device.ts";

export type View =
  /** Checking the session, or on the way to a sign-in page. Nothing shows. */
  | { screen: "starting" }
  | { screen: "needs-connection" }
  | { screen: "no-access" }
  | { screen: "signed-out-here" }
  | { screen: "home"; person: Person; online: boolean };

export const NO_ACCESS_PATH = "/no-access";

export class Notes {
  #view: View = { screen: "starting" };
  readonly #listeners = new Set<() => void>();
  readonly #offlineReady: Promise<unknown>;

  /** `offlineReady` settles once the service worker can start the app with no network. */
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
    window.addEventListener("online", () => void this.#reconnected());
    window.addEventListener("offline", () => this.#wentOffline());
    // The server sends people here when it refuses them. Starting a sign-in from here would only
    // bring them back, so this screen waits for them to choose another account.
    if (location.pathname === NO_ACCESS_PATH) {
      this.#show({ screen: "no-access" });
      return;
    }
    if (signOutWaiting()) {
      await this.#finishSignOut();
      return;
    }
    await this.#checkSession();
  }

  /** Signs out of the homelab account, or, offline, signs out on this device at once. */
  async signOut(): Promise<void> {
    rememberPerson(undefined);
    // Saved first, so a sign-out cut short by a lost connection still finishes next time.
    setSignOutWaiting(true);
    await this.#finishSignOut();
  }

  async #finishSignOut(): Promise<void> {
    const endSessionUrl = await signOutOfNotes();
    if (!endSessionUrl) {
      this.#show({ screen: "signed-out-here" });
      return;
    }
    setSignOutWaiting(false);
    location.assign(endSessionUrl);
  }

  async #checkSession(): Promise<void> {
    const result = await checkSession();
    if (result.status === "signed-in") {
      rememberPerson(result.person);
      this.#show({ screen: "home", person: result.person, online: true });
    } else if (result.status === "signed-out") {
      rememberPerson(undefined);
      await this.#goToSignIn();
    } else {
      const person = rememberedPerson();
      this.#show(
        person
          ? { screen: "home", person, online: false }
          : { screen: "needs-connection" },
      );
    }
  }

  async #goToSignIn(): Promise<void> {
    this.#show({ screen: "starting" });
    // On a first visit, the app shell is still being cached; leaving now would leave a device that
    // cannot open Notes offline.
    await this.#offlineReady;
    location.replace(SIGN_IN_PATH);
  }

  async #reconnected(): Promise<void> {
    const { screen } = this.#view;
    if (screen === "home" || screen === "needs-connection")
      await this.#checkSession();
  }

  #wentOffline(): void {
    if (this.#view.screen === "home")
      this.#show({ ...this.#view, online: false });
  }

  #show(view: View): void {
    this.#view = view;
    for (const listener of this.#listeners) listener();
  }
}
