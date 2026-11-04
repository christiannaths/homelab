import assert from "node:assert/strict";
import { test } from "node:test";
import { previewName } from "./name.ts";

test("turns a branch into a lowercase name with hyphens", () => {
  assert.equal(previewName("feat/offline-sync"), "feat-offline-sync");
  assert.equal(previewName("Fix/42_Login.Redirect"), "fix-42-login-redirect");
});

test("keeps a name at the longest length unchanged", () => {
  const branch = "a".repeat(40);
  assert.equal(previewName(branch), branch);
});

test("shortens a long branch to a stable name of at most 40 characters", () => {
  const branch = `feat/${"long-".repeat(20)}name`;
  const name = previewName(branch);
  assert.ok(name.length <= 40);
  assert.match(name, /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/);
  assert.equal(previewName(branch), name);
});

test("keeps long branches that share a beginning apart", () => {
  const start = "feat/".padEnd(60, "a");
  assert.notEqual(previewName(`${start}b`), previewName(`${start}c`));
});

test("names a branch with no letters or digits", () => {
  assert.match(previewName("---"), /^[a-f0-9]{6}$/);
});
