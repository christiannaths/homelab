// The app's own list of who it lets in. VoidAuth only proves who someone is; this decides
// whether that person may use the app, and as what.

export type Role = "owner" | "member";
export type Member = { sub: string; role: Role; email: string | null; name: string | null };

/** An app invite: a one-time link, optionally tied to an email address. */
export type Invite = { token: string; email: string | null; createdBy: string };

/** Who signed in, as VoidAuth vouches for it. */
export type Identity = {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  isInstanceAdmin: boolean;
};

export type Decision =
  | { allowed: true; member: Member; how: "member" | "first-owner" | "invite-link" | "invited-email"; usedInvite?: string }
  | { allowed: false };

export function decideAccess(
  members: ReadonlyMap<string, Member>,
  invites: ReadonlyMap<string, Invite>,
  who: Identity,
  joinToken: string | undefined,
): Decision {
  const existing = members.get(who.sub);
  if (existing) return { allowed: true, member: existing, how: "member" };

  const asMember: Member = { sub: who.sub, role: "member", email: who.email, name: who.name };

  // The one-time link itself is the proof: whoever holds it may join, whatever their email.
  if (joinToken && invites.has(joinToken)) {
    return { allowed: true, member: asMember, how: "invite-link", usedInvite: joinToken };
  }

  // An invite sent through VoidAuth: the invitee came back with that email, verified by VoidAuth.
  if (who.email && who.emailVerified) {
    const email = who.email.toLowerCase();
    const invite = [...invites.values()].find((i) => i.email?.toLowerCase() === email);
    if (invite) return { allowed: true, member: asMember, how: "invited-email", usedInvite: invite.token };
  }

  const hasOwner = [...members.values()].some((m) => m.role === "owner");
  if (!hasOwner && who.isInstanceAdmin) {
    return { allowed: true, member: { ...asMember, role: "owner" }, how: "first-owner" };
  }

  return { allowed: false };
}
