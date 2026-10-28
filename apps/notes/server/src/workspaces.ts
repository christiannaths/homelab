import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { text } from "./rows.ts";

const ROLES = ["owner", "member", "guest"] as const;
/** A person's role in one workspace (ADR-NOTE-011). */
export type WorkspaceRole = (typeof ROLES)[number];

const isRole = (value: string): value is WorkspaceRole =>
  ROLES.some((role) => role === value);

export interface Membership {
  workspaceId: string;
  personId: string;
  role: WorkspaceRole;
}

/**
 * Workspaces and who belongs to each, as server account data (ADR-NOTE-013): roles are never
 * edited offline. A workspace's name is in its Yjs document instead.
 */
export class Workspaces {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  memberships(): Membership[] {
    return this.#db
      .prepare("SELECT workspace_id, person_id, role FROM workspace_members")
      .all()
      .map((row) => {
        const role = text(row, "role");
        if (!isRole(role)) throw new Error(`Unknown workspace role ${role}`);
        return {
          workspaceId: text(row, "workspace_id"),
          personId: text(row, "person_id"),
          role,
        };
      });
  }

  /** Makes a workspace whose one member is `ownerId`, as its owner. */
  create(ownerId: string): Membership {
    const membership: Membership = {
      // ADR-NOTE-013: ids are random, so knowing one gives nothing away.
      workspaceId: randomUUID(),
      personId: ownerId,
      role: "owner",
    };
    const now = Date.now();
    this.#db.exec("BEGIN");
    try {
      this.#db
        .prepare("INSERT INTO workspaces (id, created_at) VALUES (?, ?)")
        .run(membership.workspaceId, now);
      this.#db
        .prepare(
          `INSERT INTO workspace_members (workspace_id, person_id, role, created_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run(membership.workspaceId, ownerId, membership.role, now);
      this.#db.exec("COMMIT");
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
    return membership;
  }
}
