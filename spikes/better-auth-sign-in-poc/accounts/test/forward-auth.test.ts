import { describe, expect, it } from "vitest";
import { answer, appOf, safeReturnTo } from "../src/forward-auth.ts";

const site = { domain: "home.test", accountsUrl: "https://accounts.home.test" };
const ada = {
  id: "u1",
  email: "ada@example.com",
  name: "Ada Lovelace",
  groups: ["notes"],
};
const notes = {
  proto: "https",
  host: "notes.home.test:8453",
  uri: "/page?id=1",
};

describe("appOf", () => {
  it("is the subdomain under the homelab's domain", () => {
    expect(appOf("notes.home.test:8453", "home.test")).toBe("notes");
    expect(appOf("Notes.Home.Test", "home.test")).toBe("notes");
  });

  it("is nothing for other hostnames", () => {
    expect(appOf("home.test", "home.test")).toBeUndefined();
    expect(appOf("a.notes.home.test", "home.test")).toBeUndefined();
    expect(appOf("notes.evilhome.test", "home.test")).toBeUndefined();
  });
});

describe("answer", () => {
  it("sends a signed-out browser to sign in, and back to where it was going", () => {
    const result = answer(undefined, notes, site);
    expect(result).toEqual({
      kind: "sign-in",
      location: `https://accounts.home.test/sign-in?return-to=${encodeURIComponent("https://notes.home.test:8453/page?id=1")}`,
    });
  });

  it("lets a member or an app admin in, with who they are", () => {
    expect(answer(ada, notes, site)).toEqual({
      kind: "allow",
      headers: {
        "Remote-User": "u1",
        "Remote-Email": "ada@example.com",
        "Remote-Name": "Ada Lovelace",
        "Remote-Groups": "notes",
      },
    });
    expect(answer({ ...ada, groups: ["notes-admins"] }, notes, site).kind).toBe(
      "allow",
    );
  });

  it("refuses a person without the app's groups, and hostnames that aren't an app", () => {
    expect(answer({ ...ada, groups: ["encyclopedia"] }, notes, site)).toEqual({
      kind: "no-access",
      app: "notes",
    });
    expect(answer(ada, { ...notes, host: "home.test" }, site).kind).toBe(
      "no-access",
    );
  });

  it("percent-encodes a name that can't be a raw header", () => {
    const result = answer({ ...ada, name: "Zoë" }, notes, site);
    expect(result.kind === "allow" && result.headers["Remote-Name"]).toBe(
      "Zo%C3%AB",
    );
  });
});

describe("safeReturnTo", () => {
  it("keeps https addresses on the homelab's domain", () => {
    expect(safeReturnTo("https://notes.home.test:8453/x", site)).toBe(
      "https://notes.home.test:8453/x",
    );
  });

  it("falls back to the account page for anything else", () => {
    for (const value of [
      undefined,
      "/relative",
      "http://notes.home.test/",
      "https://evil.example/",
      "https://notes.home.test.evil.example/",
      "https://user:pass@notes.home.test/",
      "javascript:alert(1)",
    ])
      expect(safeReturnTo(value, site)).toBe("https://accounts.home.test/");
  });
});
