import { describe, expect, it } from "vitest";
import { DEVICE_IDLE_LIMIT_MS, Devices } from "./devices.ts";

describe("Devices", () => {
  it("ends a session after 30 days without syncing, and each sync renews it", () => {
    let now = 0;
    const devices = new Devices(() => now);
    const token = devices.issue("sub-1");

    now = DEVICE_IDLE_LIMIT_MS - 1;
    expect(devices.renew(token)).toBe(true);
    now += DEVICE_IDLE_LIMIT_MS - 1;
    expect(devices.check(token)?.sub).toBe("sub-1");
    now += 2;
    expect(devices.check(token)).toBeUndefined();
    expect(devices.renew(token)).toBe(false);
  });

  it("sets an HttpOnly, Secure, SameSite=Lax cookie lasting 30 days", () => {
    const cookie = new Devices().cookie("abc");
    expect(cookie).toBe(
      "notes_device=abc; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000",
    );
  });
});
