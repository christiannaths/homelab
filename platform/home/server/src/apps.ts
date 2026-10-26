// Works out a person's apps from their App access (ADR-PLAT-004): access to `<app>` at any level
// means the app at `<app>.<parent domain>`, and an id with no manifest there is not an app.
import type { App, AppDirectory } from "@homelab/app-manifests";
import type { AppAccess } from "@homelab/identity";

/** Every account reaches Home, so it is in everyone's list. */
export const HOME = "home";

// One DNS label, as every app's subdomain is.
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function appIds(access: AppAccess): string[] {
  const ids = new Set([HOME]);
  for (const id of Object.keys(access)) if (LABEL.test(id)) ids.add(id);
  return [...ids];
}

/** The person's apps, sorted by name. Home is always one of them. */
export async function appsFor(
  directory: AppDirectory,
  access: AppAccess,
): Promise<App[]> {
  const apps = await Promise.all(
    appIds(access).map(async (id) => {
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
