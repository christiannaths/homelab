// Apps as the homelab shows them (ADR-PLAT-004): with the name and icon from each app's manifest,
// read through the gateway, or under its subdomain while that can't be read. `/api/me`, the account
// page and the People page all show apps this way.
import type { App, AppDirectory } from "@homelab/app-manifests";
import type { Grants } from "./app-access.ts";
import { appName } from "./pages.ts";

export class ShownApps {
  readonly #directory: AppDirectory;
  readonly #warn: (message: string) => void;
  /** The apps warned about since their manifest was last read. */
  readonly #warned = new Set<string>();

  constructor(directory: AppDirectory, warn: (message: string) => void) {
    this.#directory = directory;
    this.#warn = warn;
  }

  /**
   * An installed app, from its manifest. While that can't be read, the app is named after its
   * subdomain, with no icon and not opening offline, and one warning names it.
   */
  async app(id: string): Promise<App> {
    const read = await this.#directory.app(id);
    if (read) {
      this.#warned.delete(id);
      return read;
    }
    const url = this.#directory.urlOf(id);
    if (!this.#warned.has(id)) {
      this.#warned.add(id);
      this.#warn(
        `Can't read the manifest of the installed app ${id} at ${new URL("manifest.webmanifest", url).href}, so it shows with no name or icon of its own.`,
      );
    }
    return {
      id,
      url: url.href,
      name: appName(id),
      icon: null,
      opensOffline: false,
    };
  }

  /** The apps in a person's App access, sorted by name. */
  async of(grants: Grants): Promise<App[]> {
    const apps = await Promise.all(
      Object.keys(grants).map((id) => this.app(id)),
    );
    return apps.toSorted((a, b) => a.name.localeCompare(b.name));
  }
}
