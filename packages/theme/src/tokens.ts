// The homelab look, defined once for light and dark so every app matches (ADR-NOTE-007,
// ADR-ENCY-006). It feeds Mantine's theme, each app's manifest and browser chrome, and BlockNote's
// `--bn-*` variables once Notes' editor arrives. Plain values, so Vite configs can read them too.
export const tokens = {
  font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  radius: "md",
  accent: "gray",
  /** The page background, which the browser's chrome around an installed app matches. */
  surface: { light: "#ffffff", dark: "#1f1f1f" },
  // Named as BlockNote names its shadow variables (`--bn-shadow-light`, `--bn-shadow-medium`).
  shadow: {
    light: "0 1px 2px rgb(15 15 15 / 10%)",
    medium: "0 4px 12px rgb(15 15 15 / 15%)",
  },
  // For the App switcher, which renders without Mantine, in Mantine's default gray scheme.
  text: { light: "#212529", dark: "#c9c9c9" },
  dimmed: { light: "#868e96", dark: "#828282" },
  border: { light: "#dee2e6", dark: "#424242" },
  hover: { light: "#f1f3f5", dark: "#2e2e2e" },
  /**
   * User icons' colours, each dark enough for white initials (at least 4.5:1). The App switcher
   * picks one from the username, so a person's icon is the same colour in every app.
   */
  avatar: [
    "#b91c1c",
    "#c2410c",
    "#a16207",
    "#4d7c0f",
    "#15803d",
    "#0f766e",
    "#0369a1",
    "#1d4ed8",
    "#6d28d9",
    "#be185d",
  ],
} as const;
