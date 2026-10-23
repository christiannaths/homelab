// The one answer from Home that every <homelab-switcher> on the page shows. The last answer is kept
// on the device, so the switcher still shows when the app opens offline or Home can't be reached.
import { forgetIcons, keepIcons, keptIcons, type Icons } from "./icons.ts";
import { ask, homeOrigin, parseMe, type Me } from "./me.ts";

export type State =
  | { status: "asking" }
  | { status: "signed-out" }
  /** `icons` holds the kept icons when the answer is the kept one, and the menu loads them otherwise. */
  | { status: "signed-in"; me: Me; icons?: Icons };

const KEPT_KEY = "homelab.switcher";

// Storage can be unavailable (a private window, blocked site data); nothing is kept then.
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

// The kept answer shows at once, and Home's answer replaces it, so a connection that hangs
// instead of failing still shows the switcher.
const first = kept();
let state: State = first
  ? { status: "signed-in", me: first, icons: keptIcons() }
  : { status: "asking" };
let asking: Promise<void> | undefined;
const listeners = new Set<() => void>();

function set(next: State): void {
  state = next;
  for (const listener of listeners) listener();
}

export const current = (): State => state;

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Forgets the kept answer and icons, as a signed-out answer does, when this page signs out. The
 * menu stays as it is while the page goes to sign in.
 */
export function forget(): void {
  keep(undefined);
  forgetIcons();
}

/** Asks Home again, unless a question is already on its way. */
export function refresh(): Promise<void> {
  asking ??= ask(homeOrigin(location))
    .then((answer) => {
      if (answer.status === "signed-in") {
        keep(answer.me);
        void keepIcons(answer.me.apps);
        set({ status: "signed-in", me: answer.me });
      } else if (answer.status === "signed-out") {
        keep(undefined);
        forgetIcons();
        set({ status: "signed-out" });
      } else {
        const me = kept();
        set(
          me
            ? { status: "signed-in", me, icons: keptIcons() }
            : { status: "signed-out" },
        );
      }
    })
    .finally(() => (asking = undefined));
  return asking;
}

// Coming back online is when access granted or removed meanwhile shows up. Going offline changes
// what is greyed out.
window.addEventListener("online", () => void refresh());
window.addEventListener("offline", () => set(state));
