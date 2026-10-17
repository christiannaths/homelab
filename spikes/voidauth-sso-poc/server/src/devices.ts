// The app's own long-lived device session, independent of VoidAuth once issued: it ends after
// 30 days without syncing, and each sync renews it.
import { randomBytes } from "node:crypto";

export const DEVICE_COOKIE = "notes_device";
export const DEVICE_IDLE_LIMIT_MS = 30 * 24 * 60 * 60 * 1000;

export type Device = { sub: string; lastSyncAt: number };

export class Devices {
  readonly #devices = new Map<string, Device>();
  readonly #now: () => number;

  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  issue(sub: string): string {
    const token = randomBytes(32).toString("base64url");
    this.#devices.set(token, { sub, lastSyncAt: this.#now() });
    return token;
  }

  /** The device's person, or undefined if the token is unknown or idle too long. */
  check(token: string | undefined): Device | undefined {
    const device = token ? this.#devices.get(token) : undefined;
    if (!device || !token) return undefined;
    if (this.#now() - device.lastSyncAt > DEVICE_IDLE_LIMIT_MS) {
      this.#devices.delete(token);
      return undefined;
    }
    return device;
  }

  /** Record a sync; returns false if the session has already ended. */
  renew(token: string | undefined): boolean {
    const device = this.check(token);
    if (!device) return false;
    device.lastSyncAt = this.#now();
    return true;
  }

  cookie(token: string): string {
    return `${DEVICE_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${DEVICE_IDLE_LIMIT_MS / 1000}`;
  }
}
