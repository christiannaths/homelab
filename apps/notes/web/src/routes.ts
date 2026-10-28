import { useSyncExternalStore } from "react";

// Each page has its own address (spec #130); the server and the service worker answer every
// such path with the app shell.

export const pagePath = (id: string): string => `/pages/${id}`;

/** The page an address is for, or null for any other address. */
export function pageIdFrom(path: string): string | null {
  const match = /^\/pages\/([^/]+)$/.exec(path);
  return match ? decodeURIComponent(match[1]) : null;
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  addEventListener("popstate", listener);
  return () => {
    listeners.delete(listener);
    removeEventListener("popstate", listener);
  };
}

/** The current address's path, updating on `navigate` and on back and forward. */
export const usePath = (): string =>
  useSyncExternalStore(subscribe, () => location.pathname);

/** Goes to `path` without reloading; `replace` keeps it out of the back button's history. */
export function navigate(path: string, { replace = false } = {}): void {
  if (path === location.pathname) return;
  if (replace) history.replaceState(null, "", path);
  else history.pushState(null, "", path);
  for (const listener of listeners) listener();
}
