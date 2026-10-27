// Loading test people again, as a preview does on every start: only the people missing are made,
// so changes made in the preview since are kept.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadTestPeople } from "../src/test-people.ts";
import {
  ADA,
  askGateway,
  BOB,
  signIn,
  startAccounts,
  submitSignIn,
  type TestAccounts,
} from "./helpers.ts";

let accounts: TestAccounts;

beforeAll(async () => {
  accounts = await startAccounts([ADA]);
});
afterAll(() => accounts.close());

describe("loading only the missing people", () => {
  it("leaves people who are there as they are, and makes the others", async () => {
    await loadTestPeople(accounts, [
      { ...ADA, password: "a-new-password-ada-chose", apps: {} },
    ]);

    const ids = await loadTestPeople(accounts, [ADA, BOB], {
      onlyMissing: true,
    });

    expect(ids[ADA.email]).toBe(accounts.ids[ADA.email]);
    expect((await submitSignIn(accounts, ADA)).status).toBe(401);
    const ada = await signIn(accounts, {
      email: ADA.email,
      password: "a-new-password-ada-chose",
    });
    expect((await askGateway(accounts, ada)).status).toBe(403);
    const bob = await signIn(accounts, BOB);
    expect((await askGateway(accounts, bob, "home.home.test")).status).toBe(
      200,
    );
  });
});
