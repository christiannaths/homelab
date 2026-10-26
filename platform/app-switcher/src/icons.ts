// The other apps' icons, kept on the device with the accounts site's last answer, so the menu shows
// them when the app opens offline or the site can't be reached, without any app's service worker
// keeping them.
// Each is kept small, as a data address, since the menu shows it at 20 pixels.
import type { App } from "./me.ts";

const KEY = "homelab.switcher.icons";
/** Twice the menu's 20 pixels, for sharp icons on high-density screens. */
const SIZE = 40;

export type Icons = Record<string, string>;

// Storage can be unavailable (a private window, blocked site data); nothing is kept then.
export function keptIcons(): Icons {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    if (typeof value !== "object" || value === null) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

function store(icons: Icons | undefined): void {
  try {
    if (icons) localStorage.setItem(KEY, JSON.stringify(icons));
    else localStorage.removeItem(KEY);
  } catch {
    // See keptIcons().
  }
}

// Counts the accounts site's answers, so icons still loading for an older answer aren't kept over a newer one,
// such as a sign-out.
let answers = 0;

/** Keeps the icons of exactly these apps, keeping an earlier copy of any that fails to load. */
export async function keepIcons(apps: App[]): Promise<void> {
  const answer = ++answers;
  const before = keptIcons();
  const addresses = apps.flatMap((app) => (app.icon ? [app.icon] : []));
  const shrunk = await Promise.all(addresses.map(shrink));
  if (answer !== answers) return;
  const icons: Icons = {};
  addresses.forEach((address, i) => {
    const icon = shrunk[i] ?? before[address];
    if (icon) icons[address] = icon;
  });
  store(icons);
}

export function forgetIcons(): void {
  answers++;
  store(undefined);
}

/**
 * The icon at `address`, drawn at SIZE pixels. It loads with CORS, which the gateway allows for
 * icons, so the canvas can be read; an error page never loads as an image.
 */
function shrink(address: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.addEventListener("load", () => {
      const canvas = document.createElement("canvas");
      canvas.width = SIZE;
      canvas.height = SIZE;
      const context = canvas.getContext("2d");
      if (!context) return resolve(undefined);
      context.drawImage(image, 0, 0, SIZE, SIZE);
      try {
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(undefined);
      }
    });
    image.addEventListener("error", () => resolve(undefined));
    image.src = address;
  });
}
