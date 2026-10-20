import { createTheme, type CSSVariablesResolver } from "@mantine/core";
import { tokens } from "./tokens.ts";

export const theme = createTheme({
  fontFamily: tokens.font,
  headings: { fontFamily: tokens.font },
  defaultRadius: tokens.radius,
  primaryColor: tokens.accent,
  shadows: { sm: tokens.shadow.light, md: tokens.shadow.medium },
});

export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: { "--mantine-color-body": tokens.surface.light },
  dark: { "--mantine-color-body": tokens.surface.dark },
});
