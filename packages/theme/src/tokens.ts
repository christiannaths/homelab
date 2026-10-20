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
} as const;
