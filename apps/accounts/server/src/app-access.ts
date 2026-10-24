// App access: which installed apps each person may open, and at what level (ADR-PLAT-004).
import type { DatabaseSync } from "node:sqlite";

export const LEVELS = ["member", "admin"] as const;
export type Level = (typeof LEVELS)[number];

export const isLevel = (value: unknown): value is Level =>
  LEVELS.some((level) => level === value);

/** A person's App access, by app subdomain. */
export type Grants = Record<string, Level>;

export class AppAccess {
  readonly #db: DatabaseSync;
  readonly #installed: readonly string[];

  constructor(db: DatabaseSync, installed: readonly string[]) {
    this.#db = db;
    this.#installed = installed;
    // Better Auth's user table holds the people; removing one removes their App access.
    db.exec(`CREATE TABLE IF NOT EXISTS app_access (
      user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
      app     TEXT NOT NULL,
      level   TEXT NOT NULL CHECK (level IN ('member', 'admin')),
      PRIMARY KEY (user_id, app)
    )`);
  }

  isInstalled(app: string): boolean {
    return this.#installed.includes(app);
  }

  /**
   * The person's App access to installed apps. Access to an app no longer installed stays stored
   * but opens nothing.
   */
  of(userId: string): Grants {
    const grants: Grants = {};
    const rows = this.#db
      .prepare(
        "SELECT app, level FROM app_access WHERE user_id = ? ORDER BY app",
      )
      .all(userId);
    for (const { app, level } of rows)
      if (typeof app === "string" && this.isInstalled(app) && isLevel(level))
        grants[app] = level;
    return grants;
  }

  /**
   * Replaces the person's App access to installed apps. Access stored for an app no longer
   * installed is kept, as `of` promises. Throws for an app that isn't installed. Joins a
   * transaction already open on the database, so it rolls back with it.
   */
  set(userId: string, grants: Grants): void {
    for (const [app, level] of Object.entries(grants)) {
      if (!this.isInstalled(app))
        throw new Error(`${app} isn't an installed app`);
      if (!isLevel(level)) throw new Error(`${app} needs member or admin`);
    }
    this.#db.exec("SAVEPOINT set_app_access");
    try {
      const remove = this.#db.prepare(
        "DELETE FROM app_access WHERE user_id = ? AND app = ?",
      );
      for (const app of this.#installed) remove.run(userId, app);
      const insert = this.#db.prepare(
        "INSERT INTO app_access (user_id, app, level) VALUES (?, ?, ?)",
      );
      for (const [app, level] of Object.entries(grants))
        insert.run(userId, app, level);
      this.#db.exec("RELEASE set_app_access");
    } catch (error) {
      this.#db.exec("ROLLBACK TO set_app_access; RELEASE set_app_access");
      throw error;
    }
  }
}

/** App access as Remote-Groups lists it: `<app>` for a member, `<app>-admins` for an admin. */
export function groupsOf(grants: Grants): string[] {
  return Object.entries(grants)
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([app, level]) => (level === "admin" ? `${app}-admins` : app));
}
