// The App switcher's script, which the gateway puts inline into every page of every app
// (ADR-PLAT-004). It adds the tab at the top of the page, which has no options: every app gets
// the same one.
import { HomelabSwitcher } from "./element.ts";

const NAME = "homelab-switcher";

if (!customElements.get(NAME)) {
  customElements.define(NAME, HomelabSwitcher);
  // Beside <body> rather than in it, so an app that replaces its body's contents keeps the tab.
  document.documentElement.append(document.createElement(NAME));
}
