// Works out a person's apps from their VoidAuth groups (ADR-PLAT-004): the group `<app>` or
// `<app>-admins` means the app at `<app>.<parent domain>`, and a group with no manifest there is
// not an app.
import type { ReadManifest } from "./manifests.ts";

export interface App {
  /** The app's subdomain, which is also its VoidAuth group. */
  id: string;
  url: string;
  name: string;
  /** An icon from the app's manifest, as an absolute address. */
  icon: string | null;
  opensOffline: boolean;
}

/** Every account reaches Home, so it is in everyone's list. */
export const HOME = "home";

/** A manifest kept this long is read again on the next request that needs it. */
const FRESH_MS = 5 * 60_000;
/** A subdomain with no manifest is asked about again after this long. */
const MISSING_MS = 60_000;
/** How long an app whose manifest stops answering stays listed, in case it is restarting. */
const KEPT_MS = 24 * 60 * 60_000;
// One DNS label. Rules out VoidAuth's own groups, such as auth_admins.
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function appIds(groups: string[]): string[] {
  const ids = new Set([HOME]);
  for (const group of groups) {
    const id = group.endsWith("-admins") ? group.slice(0, -7) : group;
    if (LABEL.test(id)) ids.add(id);
  }
  return [...ids];
}

/** An app as its manifest describes it, or undefined for anything that isn't a manifest. */
export function appFrom(
  id: string,
  url: URL,
  manifest: unknown,
): App | undefined {
  if (!isRecord(manifest)) return undefined;
  const name = [manifest.name, manifest.short_name].find(
    (value) => typeof value === "string" && value.trim(),
  );
  if (typeof name !== "string") return undefined;
  const manifestUrl = new URL("manifest.webmanifest", url);
  const icons = Array.isArray(manifest.icons)
    ? manifest.icons.filter(isRecord)
    : [];
  // A maskable-only icon is cropped by the platform, so it is the last resort.
  const ranked = icons
    .filter((icon) => typeof icon.src === "string")
    .toSorted((a, b) => iconRank(a) - iconRank(b) || iconSize(b) - iconSize(a));
  const icon = ranked[0];
  return {
    id,
    url: url.href,
    name: name.trim(),
    icon: icon ? new URL(String(icon.src), manifestUrl).href : null,
    opensOffline:
      isRecord(manifest.homelab) && manifest.homelab.opens_offline === true,
  };
}

function iconRank(icon: Record<string, unknown>): number {
  const purposes = (
    typeof icon.purpose === "string" ? icon.purpose : "any"
  ).split(/\s+/);
  return purposes.includes("any") ? 0 : 1;
}

/** The icon's largest size up to 512 pixels, so a tile gets a sharp icon but not a huge one. */
function iconSize(icon: Record<string, unknown>): number {
  const sizes = (typeof icon.sizes === "string" ? icon.sizes : "")
    .split(/\s+/)
    .map((size) => Number(size.split("x")[0]))
    .filter((size) => size > 0 && size <= 512);
  return Math.max(0, ...sizes);
}

interface Cached {
  app: App | undefined;
  readAt: number;
  /** When the app's manifest was last read successfully. */
  seenAt: number;
}

/** Every app's manifest as Home last read it, shared by everyone's requests. */
export class AppDirectory {
  readonly #homelab: URL;
  readonly #read: ReadManifest;
  readonly #now: () => number;
  readonly #cache = new Map<string, Cached>();
  readonly #reading = new Map<string, Promise<App | undefined>>();

  constructor(homelab: URL, read: ReadManifest, now = Date.now) {
    this.#homelab = homelab;
    this.#read = read;
    this.#now = now;
  }

  urlOf(id: string): URL {
    return new URL(`${this.#homelab.protocol}//${id}.${this.#homelab.host}/`);
  }

  /** The person's apps, sorted by name. Home is always one of them. */
  async appsFor(groups: string[]): Promise<App[]> {
    const apps = await Promise.all(
      appIds(groups).map(async (id) => {
        const app = await this.#app(id);
        // Home's own manifest can't be missing for long, but its tile is never left out.
        return id === HOME && !app
          ? {
              id,
              url: this.urlOf(id).href,
              name: "Home",
              icon: null,
              opensOffline: true,
            }
          : app;
      }),
    );
    return apps
      .filter((app) => app !== undefined)
      .toSorted((a, b) => a.name.localeCompare(b.name));
  }

  async #app(id: string): Promise<App | undefined> {
    const cached = this.#cache.get(id);
    const age = cached ? this.#now() - cached.readAt : Infinity;
    if (cached && age < (cached.app ? FRESH_MS : MISSING_MS)) return cached.app;
    let reading = this.#reading.get(id);
    if (!reading) {
      reading = this.#readApp(id, cached).finally(() =>
        this.#reading.delete(id),
      );
      this.#reading.set(id, reading);
    }
    return reading;
  }

  async #readApp(
    id: string,
    cached: Cached | undefined,
  ): Promise<App | undefined> {
    const url = this.urlOf(id);
    const manifest = await this.#read(new URL("manifest.webmanifest", url));
    const now = this.#now();
    const read = appFrom(id, url, manifest);
    if (read) {
      this.#cache.set(id, { app: read, readAt: now, seenAt: now });
      return read;
    }
    // An app that was there recently is kept while its manifest can't be read, so one failed
    // read, or the app restarting, doesn't take it out of everyone's menu.
    const kept = cached && now - cached.seenAt < KEPT_MS ? cached : undefined;
    this.#cache.set(id, {
      app: kept?.app,
      readAt: now,
      seenAt: kept?.seenAt ?? 0,
    });
    return kept?.app;
  }
}
