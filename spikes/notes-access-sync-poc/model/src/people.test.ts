import { describe, expect, it } from "vitest";
import { addPerson, removePerson, type Person } from "./people.ts";

const owner: Person = { id: "o", name: "Olive", role: "owner" };
const member: Person = { id: "m", name: "Max", role: "member" };

describe("addPerson", () => {
  it("makes the first person the workspace owner, whatever role was asked for", () => {
    expect(
      addPerson([], null, { id: "a", name: "Ada", role: "guest" }),
    ).toEqual({
      ok: true,
      person: { id: "a", name: "Ada", role: "owner" },
    });
  });

  it("lets the owner add members and guests", () => {
    expect(
      addPerson([owner], owner, { id: "b", name: "Bea", role: "member" }),
    ).toEqual({
      ok: true,
      person: { id: "b", name: "Bea", role: "member" },
    });
    expect(
      addPerson([owner], owner, { id: "g", name: "Gus", role: "guest" }),
    ).toEqual({
      ok: true,
      person: { id: "g", name: "Gus", role: "guest" },
    });
  });

  it("refuses anyone but an owner adding people once the workspace has an owner", () => {
    expect(
      addPerson([owner, member], member, {
        id: "x",
        name: "Xan",
        role: "member",
      }).ok,
    ).toBe(false);
    expect(
      addPerson([owner], null, { id: "x", name: "Xan", role: "member" }).ok,
    ).toBe(false);
  });

  it("refuses an empty name", () => {
    expect(addPerson([], null, { id: "a", name: "  ", role: "owner" }).ok).toBe(
      false,
    );
  });

  it("trims the name", () => {
    expect(
      addPerson([], null, { id: "a", name: " Ada ", role: "owner" }),
    ).toMatchObject({ person: { name: "Ada" } });
  });
});

// Story 45: a workspace owner removes a person.
describe("removePerson", () => {
  const guest: Person = { id: "g", name: "Gus", role: "guest" };
  const coOwner: Person = { id: "o2", name: "Oz", role: "owner" };

  it("lets an owner remove a member, a guest or another owner", () => {
    expect(removePerson([owner, member, guest], owner, "m")).toEqual({
      ok: true,
      person: member,
    });
    expect(removePerson([owner, member, guest], owner, "g")).toEqual({
      ok: true,
      person: guest,
    });
    expect(removePerson([owner, coOwner], owner, "o2")).toEqual({
      ok: true,
      person: coOwner,
    });
  });

  it("refuses anyone but an owner, an unknown person, and removing the last owner", () => {
    expect(removePerson([owner, member, guest], member, "g").ok).toBe(false);
    expect(removePerson([owner, member], null, "m").ok).toBe(false);
    expect(removePerson([owner, member], owner, "nobody").ok).toBe(false);
    expect(removePerson([owner, member], owner, "o").ok).toBe(false);
  });
});
