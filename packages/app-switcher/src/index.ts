// The App switcher's script, which Home serves and every app adds with one tag (ADR-PLAT-004):
//
//   <script src="/_homelab/switcher.js" data-placement="element" data-theme="dark"></script>
//
// data-placement is "element", for a <homelab-switcher> the app puts in its header, or a corner
// for a floating icon: top-right (the default with no element on the page), top-left,
// bottom-right or bottom-left. data-theme is light or dark; an element's own theme attribute
// wins, and with neither it follows the device.
import { HomelabSwitcher, setDefaultTheme } from "./element.ts";

const CORNERS = ["top-right", "top-left", "bottom-right", "bottom-left"];
const NAME = "homelab-switcher";

const script = document.currentScript;
const placement = script?.dataset.placement;
const theme = script?.dataset.theme;
setDefaultTheme(theme === "light" || theme === "dark" ? theme : undefined);

if (!customElements.get(NAME)) customElements.define(NAME, HomelabSwitcher);

function float(): void {
  if (placement !== "element" && !document.querySelector(NAME)) {
    const floating = document.createElement(NAME);
    floating.setAttribute(
      "corner",
      CORNERS.includes(placement ?? "") ? (placement ?? "") : "top-right",
    );
    document.body.append(floating);
  }
}

// An app may put its element on the page after this script runs, so the check waits for the page.
if (CORNERS.includes(placement ?? "")) float();
else if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", float);
else float();
