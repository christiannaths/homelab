import { describe, expect, test } from "vitest";
import { identityFrom, identityHeaders, type Identity } from "./identity.ts";

const ADA = {
  id: "dGHO77nKOy2qDMol5ww1hm15mNm0xTvB",
  name: "Ada Lovelace",
  email: "ada@example.com",
};

/** What an app reads from the headers written for this person. */
const roundTrip = (person: Identity) =>
  identityFrom(new Headers(identityHeaders(person)));

describe("the identity headers", () => {
  test("carry the person and their level in each app back to the app", () => {
    expect(
      roundTrip({ ...ADA, access: { notes: "admin", encyclopedia: "member" } }),
    ).toEqual({ ...ADA, access: { notes: "admin", encyclopedia: "member" } });
  });

  test("carry names and emails that can't go as raw headers", () => {
    const zoe = {
      id: "zoe",
      name: "Zoë Ångström 李",
      email: "zoë@exämple.com",
      access: { notes: "member" },
    } satisfies Identity;
    expect(roundTrip(zoe)).toEqual(zoe);
  });

  test("carry values containing %", () => {
    const percent = {
      id: "p%41c",
      name: "100% Ada",
      email: "100%25@example.com",
      access: { "app%41": "admin" },
    } satisfies Identity;
    expect(roundTrip(percent)).toEqual(percent);
  });

  test("carry no name, no email and no App access as none", () => {
    expect(
      roundTrip({ id: "kim", name: null, email: null, access: {} }),
    ).toEqual({ id: "kim", name: null, email: null, access: {} });
  });

  test("leave out an app whose level isn't member or admin", () => {
    const access: Record<string, string> = {
      notes: "owner",
      encyclopedia: "member",
    };
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a caller outside TypeScript, such as stored data, can pass any level.
    const person = { ...ADA, access } as unknown as Identity;
    expect(roundTrip(person)?.access).toEqual({ encyclopedia: "member" });
  });

  test("are what the gateway has always sent", () => {
    expect(
      identityHeaders({
        id: "ada",
        name: "Zoë",
        email: "ada@example.com",
        access: { notes: "admin", encyclopedia: "member" },
      }),
    ).toEqual({
      "Remote-User": "ada",
      "Remote-Email": "ada@example.com",
      "Remote-Name": "Zo%C3%AB",
      "Remote-Groups": "encyclopedia,notes-admins",
    });
  });
});

describe("the person an app reads", () => {
  test("is nobody without an account id", () => {
    expect(identityFrom(new Headers())).toBeUndefined();
    expect(
      identityFrom(
        new Headers({ "remote-name": "Ada", "remote-groups": "notes" }),
      ),
    ).toBeUndefined();
  });

  test("is an admin in an app listed at both levels", () => {
    for (const groups of ["notes,notes-admins", "notes-admins,notes"])
      expect(
        identityFrom(
          new Headers({ "remote-user": "ada", "remote-groups": groups }),
        )?.access,
      ).toEqual({ notes: "admin" });
  });
});
