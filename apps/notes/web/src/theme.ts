import { createTheme } from "@mantine/core";

// ADR-NOTE-007: the semantic design tokens, defined once. They feed Mantine's theme now, and
// BlockNote's `--bn-*` variables once the editor arrives.
export const tokens = {
  font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  radius: "md",
  accent: "gray",
  shadow: {
    light: "0 1px 2px rgb(15 15 15 / 10%)",
    medium: "0 4px 12px rgb(15 15 15 / 15%)",
  },
} as const;

export const theme = createTheme({
  fontFamily: tokens.font,
  headings: { fontFamily: tokens.font },
  defaultRadius: tokens.radius,
  primaryColor: tokens.accent,
  shadows: { sm: tokens.shadow.light, md: tokens.shadow.medium },
});
