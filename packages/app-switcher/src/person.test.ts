import { describe, expect, test } from "vitest";
import { tokens } from "@homelab/theme/tokens";
import { colourFor, initials } from "./person.ts";

describe("a user icon's initials", () => {
  test("are the first letters of the first and last words of the name", () => {
    expect(initials("Ada Lovelace", "ada")).toBe("AL");
    expect(initials("Ada King Lovelace", "ada")).toBe("AL");
    expect(initials("  zoë   ångström ", "zoe")).toBe("ZÅ");
    expect(initials("Cher", "cher")).toBe("C");
  });

  test("come from the username when there is no name", () => {
    expect(initials(null, "auth_admin")).toBe("AA");
    expect(initials("", "dana")).toBe("D");
  });
});

describe("a user icon's colour", () => {
  test("depends only on the username, from the homelab palette", () => {
    expect(colourFor("ada")).toBe(colourFor("ada"));
    expect(tokens.avatar).toContain(colourFor("ada"));
  });

  test("differs between the test accounts", () => {
    const colours = ["ada", "dana", "bob", "auth_admin"].map(colourFor);
    expect(new Set(colours).size).toBe(colours.length);
  });
});
