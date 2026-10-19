// The homelab look, copied from Notes' tokens (ADR-NOTE-007) until a second app needing them moves
// them to packages/ (ADR-PLAT-002). Plain values, so vite.config.ts can read them too.
export const tokens = {
  font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  radius: "md",
  accent: "gray",
  /** The page background, which the browser's chrome around an installed app matches. */
  surface: { light: "#ffffff", dark: "#1f1f1f" },
} as const;
