import { describe, expect, test } from "vitest";
import { tokens } from "@homelab/theme/tokens";
import { colourFor, initials } from "./person.ts";

describe("a user icon's initials", () => {
  test("are the first letters of the first and last words of the name", () => {
    expect(initials("Ada Lovelace", "ada@example.com")).toBe("AL");
    expect(initials("Ada King Lovelace", "ada@example.com")).toBe("AL");
    expect(initials("  zoë   ångström ", "zoe@example.com")).toBe("ZÅ");
    expect(initials("Cher", "cher@example.com")).toBe("C");
  });

  test("come from the email when there is no name", () => {
    expect(initials(null, "dana.scully@example.com")).toBe("DS");
    expect(initials("", "dana@example.com")).toBe("D");
  });
});

describe("a user icon's colour", () => {
  test("depends only on the account id, from the homelab palette", () => {
    const id = "dGHO77nKOy2qDMol5ww1hm15mNm0xTvB";
    expect(colourFor(id)).toBe(colourFor(id));
    expect(tokens.avatar).toContain(colourFor(id));
  });

  test("differs between accounts", () => {
    const colours = [
      "dGHO77nKOy2qDMol5ww1hm15mNm0xTvB",
      "1HMAJyQ5WZ4ooxQ1CQNbDtKCd1xcrEfK",
      "qUXwqqHYesIj3YE0ZcGtzN09OaYFIeHj",
    ].map(colourFor);
    expect(new Set(colours).size).toBe(colours.length);
  });
});
