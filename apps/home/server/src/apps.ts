// Works out a person's apps from their App access (ADR-PLAT-004): the group `<app>` or
// `<app>-admins` means the app at `<app>.<parent domain>`, and a group with no manifest there is
// not an app.
import type { App, AppDirectory } from "@homelab/app-manifests";

/** Every account reaches Home, so it is in everyone's list. */
export const HOME = "home";

// One DNS label, as every app's subdomain is.
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function appIds(groups: string[]): string[] {
  const ids = new Set([HOME]);
  for (const group of groups) {
    const id = group.endsWith("-admins") ? group.slice(0, -7) : group;
    if (LABEL.test(id)) ids.add(id);
  }
  return [...ids];
}

/** The person's apps, sorted by name. Home is always one of them. */
export async function appsFor(
  directory: AppDirectory,
  groups: string[],
): Promise<App[]> {
  const apps = await Promise.all(
    appIds(groups).map(async (id) => {
      const app = await directory.app(id);
      // Home's own manifest can't be missing for long, but its tile is never left out.
      return id === HOME && !app
        ? {
            id,
            url: directory.urlOf(id).href,
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
