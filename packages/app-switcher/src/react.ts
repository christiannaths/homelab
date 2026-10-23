// Lets a React app write <homelab-switcher> in JSX, where the App switcher should sit. Importing
// SwitcherTheme brings the element's JSX type along.
import type { DetailedHTMLProps, HTMLAttributes } from "react";

export type SwitcherTheme = "light" | "dark";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "homelab-switcher": DetailedHTMLProps<
        HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        theme?: SwitcherTheme;
      };
    }
  }
}
