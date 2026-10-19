import { describe, expect, it } from "vitest";
import { personFrom } from "./person.ts";

describe("personFrom", () => {
  it("reads the person from the gateway's headers", () => {
    expect(
      personFrom(
        {
          "remote-user": "ada",
          "remote-name": "Ada Lovelace",
          "remote-email": "ada@example.com",
          "remote-groups": "notes,encyclopedia",
        },
        "notes",
      ),
    ).toEqual({
      username: "ada",
      name: "Ada Lovelace",
      email: "ada@example.com",
      groups: ["notes", "encyclopedia"],
      level: "member",
    });
  });

  it("makes members of <app>-admins the app's admins", () => {
    const headers = { "remote-user": "ada", "remote-groups": "notes-admins" };
    expect(personFrom(headers, "notes")?.level).toBe("admin");
    expect(personFrom(headers, "encyclopedia")?.level).toBe("member");
  });

  it("leaves out what VoidAuth didn't send", () => {
    expect(personFrom({ "remote-user": "bob" }, "notes")).toEqual({
      username: "bob",
      name: null,
      email: null,
      groups: [],
      level: "member",
    });
  });

  it("decodes values VoidAuth had to percent-encode", () => {
    expect(
      personFrom({ "remote-user": "ada", "remote-name": "Zo%C3%AB" }, "notes")
        ?.name,
    ).toBe("Zoë");
  });

  it("finds nobody without Remote-User", () => {
    expect(personFrom({ "remote-groups": "notes" }, "notes")).toBeNull();
  });
});
