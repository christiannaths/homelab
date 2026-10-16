import { describe, expect, it } from "vitest";
import { documentAccess, type Workspace } from "./access.ts";

const workspace: Workspace = {
  people: [
    { id: "o", name: "Olive", role: "owner" },
    { id: "m", name: "Max", role: "member" },
    { id: "g", name: "Gus", role: "guest" },
  ],
};

describe("documentAccess (placeholder: everyone sees everything)", () => {
  it("gives every person in the workspace full access to every document", () => {
    for (const person of ["o", "m", "g"]) {
      expect(documentAccess(workspace, person, "workspace:default")).toBe("full");
      expect(documentAccess(workspace, person, "page:123")).toBe("full");
    }
  });

  it("gives someone outside the workspace no access", () => {
    expect(documentAccess(workspace, "stranger", "page:123")).toBe("none");
  });
});
