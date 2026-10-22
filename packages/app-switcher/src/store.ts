// The one answer from Home that every <homelab-switcher> on the page shows.
import { ask, homeOrigin, type Answer } from "./me.ts";

export type State = { status: "asking" } | Answer;

let state: State = { status: "asking" };
let asking: Promise<void> | undefined;
const listeners = new Set<() => void>();

export const current = (): State => state;

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Asks Home again, unless a question is already on its way. */
export function refresh(): Promise<void> {
  asking ??= ask(homeOrigin(location))
    .then((answer) => {
      state = answer;
      for (const listener of listeners) listener();
    })
    .finally(() => (asking = undefined));
  return asking;
}
