// Which screen shows, decided from two things: the person as of the last session check, and
// whether the server can be reached (issue #47). Signing out is the App switcher's (ADR-NOTE-009).
import { checkSession, SIGN_IN_PATH, type Person } from "./api.ts";
import { rememberedPerson, rememberPerson } from "./device.ts";

export type View =
  /** Checking the session, or on the way to a sign-in page. Nothing shows. */
  | { screen: "starting" }
  | { screen: "needs-connection" }
  | { screen: "home"; person: Person; online: boolean };

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
    // A sign-out made in another app or tab reaches this one when it is next looked at.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void this.#reconnected();
    });
    await this.#checkSession();
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
