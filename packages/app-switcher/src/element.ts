// <homelab-switcher>: the user icon and the menu it opens (GLOSSARY.md: App switcher). Its own
// shadow DOM keeps the app's styles and its own apart.
import type { App, Me } from "./me.ts";
import { colourFor, initials } from "./person.ts";
import { current, refresh, subscribe } from "./store.ts";
import { STYLES } from "./styles.ts";

export type Theme = "light" | "dark";

/** The theme for elements that don't set their own, from the script tag. */
let defaultTheme: Theme | undefined;
export function setDefaultTheme(theme: Theme | undefined): void {
  defaultTheme = theme;
}

const isTheme = (value: string | null): value is Theme =>
  value === "light" || value === "dark";

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Record<string, string>> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(props))
    if (value !== undefined) node.setAttribute(name, value);
  node.append(...children);
  return node;
}

/** Home first, then the person's other apps by name. */
function menuOrder(apps: App[]): App[] {
  const home = apps.filter((app) => app.id === "home");
  const others = apps
    .filter((app) => app.id !== "home")
    .toSorted((a, b) => a.name.localeCompare(b.name));
  return [...home, ...others];
}

export class HomelabSwitcher extends HTMLElement {
  static observedAttributes = ["theme"];

  readonly #shadow = this.attachShadow({ mode: "open" });
  readonly #root = element("div", { class: "root" });
  #me: Me | undefined;
  #button: HTMLButtonElement | undefined;
  #panel: HTMLDivElement | undefined;
  #items: HTMLElement[] = [];
  #unsubscribe: (() => void) | undefined;

  constructor() {
    super();
    const style = element("style");
    style.textContent = STYLES;
    this.#shadow.append(style, this.#root);
  }

  connectedCallback(): void {
    this.#applyTheme();
    this.#unsubscribe = subscribe(() => this.#show());
    this.#show();
    void refresh();
    document.addEventListener("pointerdown", this.#onOutside, true);
  }

  disconnectedCallback(): void {
    this.#unsubscribe?.();
    document.removeEventListener("pointerdown", this.#onOutside, true);
  }

  attributeChangedCallback(): void {
    this.#applyTheme();
  }

  #applyTheme(): void {
    const own = this.getAttribute("theme");
    this.#root.dataset.scheme = isTheme(own) ? own : (defaultTheme ?? "auto");
  }

  #show(): void {
    const state = current();
    const me = state.status === "signed-in" ? state.me : undefined;
    // Signed out, the switcher shows nothing and leaves signing in to the app.
    this.hidden = !me;
    if (me === this.#me) return;
    this.#me = me;
    if (me) this.#render(me);
    else this.#root.replaceChildren();
  }

  #render({ person, apps, signOutUrl }: Me): void {
    const wasOpen = this.#panel ? !this.#panel.hidden : false;
    const name = person.name ?? person.username;

    const button = element(
      "button",
      {
        "type": "button",
        "class": "avatar",
        "aria-haspopup": "menu",
        "aria-expanded": "false",
        "aria-controls": "menu",
        "aria-label": `${name}: apps and sign out`,
        "title": name,
      },
      initials(person.name, person.username),
    );
    button.style.background = colourFor(person.username);
    button.addEventListener("click", () => this.#toggle());
    button.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        this.#open(event.key === "ArrowDown" ? 0 : -1);
      }
    });

    const items = menuOrder(apps).map((app) => {
      const here = new URL(app.url).origin === location.origin;
      return element(
        "a",
        {
          "class": "item",
          "role": "menuitem",
          "tabindex": "-1",
          "href": app.url,
          "aria-current": here ? "page" : undefined,
        },
        app.icon
          ? element("img", { src: app.icon, alt: "" })
          : element("span", { class: "no-icon" }),
        element("span", { class: "label" }, app.name),
        ...(here ? [element("span", { class: "note" }, "Current")] : []),
      );
    });
    const signOut = element(
      "a",
      { class: "item", role: "menuitem", tabindex: "-1", href: signOutUrl },
      element("span", { class: "label" }, "Sign out"),
    );
    this.#items = [...items, signOut];

    const menu = element(
      "div",
      { "id": "menu", "role": "menu", "aria-label": "Apps and sign out" },
      ...items,
      element("div", { class: "separator", role: "separator" }),
      signOut,
    );
    menu.addEventListener("keydown", (event) => this.#onMenuKey(event));

    const panel = element(
      "div",
      { class: "panel", hidden: "" },
      element(
        "div",
        { class: "who" },
        element("div", { class: "name" }, name),
        ...(person.email
          ? [element("div", { class: "email" }, person.email)]
          : []),
      ),
      menu,
    );

    this.#button = button;
    this.#panel = panel;
    this.#root.replaceChildren(button, panel);
    if (wasOpen) this.#open(0);
  }

  #toggle(): void {
    if (this.#panel?.hidden) this.#open(0);
    else this.#close(false);
  }

  /** Opens the menu with focus on the item at `index`; -1 is the last. */
  #open(index: number): void {
    if (!this.#panel || !this.#button) return;
    this.#panel.hidden = false;
    this.#button.setAttribute("aria-expanded", "true");
    this.#items.at(index)?.focus();
  }

  #close(refocus: boolean): void {
    if (!this.#panel || this.#panel.hidden) return;
    this.#panel.hidden = true;
    this.#button?.setAttribute("aria-expanded", "false");
    if (refocus) this.#button?.focus();
  }

  #onMenuKey(event: KeyboardEvent): void {
    const at = this.#items.findIndex(
      (item) => item === this.#shadow.activeElement,
    );
    const count = this.#items.length;
    const focus = (index: number) => {
      event.preventDefault();
      this.#items[(index + count) % count]?.focus();
    };
    switch (event.key) {
      case "ArrowDown":
        return focus(at + 1);
      case "ArrowUp":
        return focus(at - 1);
      case "Home":
        return focus(0);
      case "End":
        return focus(count - 1);
      case "Escape":
        event.preventDefault();
        return this.#close(true);
      case "Tab":
        return this.#close(false);
      case " ":
        event.preventDefault();
        this.#items[at]?.click();
    }
  }

  readonly #onOutside = (event: Event): void => {
    if (!event.composedPath().includes(this)) this.#close(false);
  };
}
