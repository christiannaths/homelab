import { describe, expect, it } from "vitest";
import {
  ACCESS_LEVELS,
  atLeast,
  canEdit,
  canShare,
  canView,
  isAccessLevel,
  mostPermissive,
} from "./levels.ts";

describe("access levels", () => {
  it("are ordered from Full access down to No access", () => {
    expect(ACCESS_LEVELS).toEqual([
      "full",
      "edit",
      "edit-content",
      "comment",
      "view",
      "none",
    ]);
  });

  it("most permissive wins, whichever order they come in", () => {
    expect(mostPermissive("view", "edit")).toBe("edit");
    expect(mostPermissive("edit", "view")).toBe("edit");
    expect(mostPermissive("none", "comment")).toBe("comment");
    expect(mostPermissive("full", "none")).toBe("full");
  });

  it("compares a level with the one an action needs", () => {
    expect(atLeast("full", "edit")).toBe(true);
    expect(atLeast("edit", "edit")).toBe(true);
    expect(atLeast("comment", "edit")).toBe(false);
  });

  it("only Full access shares, Can edit and above edit, anything but No access opens", () => {
    expect(ACCESS_LEVELS.filter(canShare)).toEqual(["full"]);
    expect(ACCESS_LEVELS.filter(canEdit)).toEqual(["full", "edit"]);
    expect(ACCESS_LEVELS.filter(canView)).toEqual([
      "full",
      "edit",
      "edit-content",
      "comment",
      "view",
    ]);
  });

  it("recognises stored levels and nothing else", () => {
    expect(isAccessLevel("edit")).toBe(true);
    expect(isAccessLevel("owner")).toBe(false);
    expect(isAccessLevel(3)).toBe(false);
  });
});
