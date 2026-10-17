import { describe, expect, it } from "vitest";
import {
  decideAccess,
  type Identity,
  type Invite,
  type Member,
} from "./access.ts";

const person = (overrides: Partial<Identity> = {}): Identity => ({
  sub: "sub-1",
  email: "ada@example.com",
  emailVerified: true,
  name: "Ada",
  isInstanceAdmin: false,
  ...overrides,
});
const owner: Member = {
  sub: "owner",
  role: "owner",
  email: "o@example.com",
  name: "O",
};

describe("decideAccess", () => {
  it("makes the instance admin the first owner of an app with no owner", () => {
    const decision = decideAccess(
      new Map(),
      new Map(),
      person({ isInstanceAdmin: true }),
      undefined,
    );
    expect(decision).toMatchObject({
      allowed: true,
      how: "first-owner",
      member: { role: "owner" },
    });
  });

  it("does not make the instance admin an owner once the app has one", () => {
    const members = new Map([[owner.sub, owner]]);
    expect(
      decideAccess(
        members,
        new Map(),
        person({ isInstanceAdmin: true }),
        undefined,
      ),
    ).toEqual({ allowed: false });
  });

  it("turns away someone with an account but no invite", () => {
    expect(decideAccess(new Map(), new Map(), person(), undefined)).toEqual({
      allowed: false,
    });
  });

  it("lets in whoever holds a one-time invite link, whatever their email", () => {
    const invites = new Map<string, Invite>([
      [
        "t1",
        { token: "t1", email: "someone-else@example.com", createdBy: "owner" },
      ],
    ]);
    const decision = decideAccess(
      new Map(),
      invites,
      person({ emailVerified: false }),
      "t1",
    );
    expect(decision).toMatchObject({
      allowed: true,
      how: "invite-link",
      usedInvite: "t1",
      member: { role: "member" },
    });
  });

  it("lets in a verified email that was invited, but not an unverified one", () => {
    const invites = new Map<string, Invite>([
      ["t1", { token: "t1", email: "ADA@example.com", createdBy: "owner" }],
    ]);
    expect(decideAccess(new Map(), invites, person(), undefined)).toMatchObject(
      { allowed: true, how: "invited-email" },
    );
    expect(
      decideAccess(
        new Map(),
        invites,
        person({ emailVerified: false }),
        undefined,
      ),
    ).toEqual({ allowed: false });
  });

  it("keeps existing members as they are", () => {
    const members = new Map([[owner.sub, owner]]);
    expect(
      decideAccess(members, new Map(), person({ sub: "owner" }), undefined),
    ).toMatchObject({ how: "member", member: owner });
  });
});
