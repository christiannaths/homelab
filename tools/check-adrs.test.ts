import assert from "node:assert/strict";
import { test } from "node:test";
import { checkAdrs } from "./check-adrs.ts";

const registry = `# Architecture Decision Records: platform

| Namespace | Scope | Folder |
|---|---|---|
| \`PLAT\` | Every app | \`docs/adr/\` (this folder) |
| \`NOTE\` | Notes | [\`apps/notes/docs/adr/\`](../../apps/notes/docs/adr/README.md) |

| ID | Problem | Decision | Status |
|---|---|---|---|
| [ADR-PLAT-001](ADR-PLAT-001-toolchain.md) | How is the code built? | TypeScript | Accepted |
`;

const notesIndex = `# Architecture Decision Records: Notes

| ID | Problem | Decision | Status |
|---|---|---|---|
| [ADR-NOTE-001](ADR-NOTE-001-offline-use.md) | How does the app work offline? | Local first | Accepted |
| [ADR-NOTE-002](ADR-NOTE-002-merging-edits.md) | How do edits merge? | Yjs | Accepted |
`;

const adr = (
  id: string,
  title: string,
  dependsOn: string,
  dependencyOf: string,
  body = "",
) => `# ${id}. ${title}

- Status: Accepted
- Date: 2026-10-17
- Depends on: ${dependsOn}
- Dependency of: ${dependencyOf}

## Context
Forces.${body}

## Decision
- A choice.

## Evidence
- A test.

## Consequences
- A cost.
`;

/** A small repo that follows every rule. */
const valid = (): Map<string, string> =>
  new Map([
    ["docs/adr/README.md", registry],
    [
      "docs/adr/ADR-PLAT-001-toolchain.md",
      adr(
        "ADR-PLAT-001",
        "How is the code built?",
        "none",
        "[ADR-NOTE-001](../../apps/notes/docs/adr/ADR-NOTE-001-offline-use.md)",
      ),
    ],
    ["apps/notes/docs/adr/README.md", notesIndex],
    [
      "apps/notes/docs/adr/ADR-NOTE-001-offline-use.md",
      adr(
        "ADR-NOTE-001",
        "How does the app work offline?",
        "[ADR-PLAT-001](../../../../docs/adr/ADR-PLAT-001-toolchain.md)",
        "[ADR-NOTE-002](ADR-NOTE-002-merging-edits.md)",
      ),
    ],
    [
      "apps/notes/docs/adr/ADR-NOTE-002-merging-edits.md",
      adr(
        "ADR-NOTE-002",
        "How do edits merge?",
        "[ADR-NOTE-001](ADR-NOTE-001-offline-use.md)",
        "none",
        " Offline edits come from [ADR-NOTE-001](ADR-NOTE-001-offline-use.md).",
      ),
    ],
    ["apps/notes/web/src/sync.ts", "// ADR-NOTE-002: every edit merges.\n"],
  ]);

const edit = (
  files: Map<string, string>,
  path: string,
  from: string | RegExp,
  to: string,
) => {
  const text = files.get(path)!;
  const next = text.replace(from, to);
  assert.notEqual(next, text, `fixture edit did not apply to ${path}`);
  files.set(path, next);
  return files;
};

test("a repo that follows every rule has no problems", () => {
  assert.deepEqual(checkAdrs(valid()), []);
});

test("a link to an ADR file that does not exist is reported, wherever it is", () => {
  const files = valid();
  files.set(
    "apps/notes/docs/specs/sync.md",
    "See [ADR-NOTE-002](../adr/ADR-NOTE-002-merging.md).\n",
  );
  assert.deepEqual(checkAdrs(files), [
    "apps/notes/docs/specs/sync.md: link to ../adr/ADR-NOTE-002-merging.md does not resolve",
  ]);
});

test("an ID that names no ADR is reported, in docs and in code", () => {
  const files = valid();
  edit(files, "apps/notes/web/src/sync.ts", "ADR-NOTE-002", "ADR-NOTE-009");
  assert.deepEqual(checkAdrs(files), [
    "apps/notes/web/src/sync.ts: ADR-NOTE-009 does not exist",
  ]);
});

test("a link whose text names a different ADR from its target is reported", () => {
  const files = valid();
  files.set(
    "apps/notes/docs/specs/sync.md",
    "See [ADR-NOTE-001](../adr/ADR-NOTE-002-merging-edits.md).\n",
  );
  assert.deepEqual(checkAdrs(files), [
    "apps/notes/docs/specs/sync.md: link text ADR-NOTE-001 points at ADR-NOTE-002-merging-edits.md",
  ]);
});

const note2 = "apps/notes/docs/adr/ADR-NOTE-002-merging-edits.md";

test("a title that is not a How question about its own ID is reported", () => {
  const files = edit(
    valid(),
    note2,
    "# ADR-NOTE-002. How do edits merge?",
    "# ADR-NOTE-002. Yjs merges edits",
  );
  edit(
    files,
    "apps/notes/docs/adr/README.md",
    "How do edits merge?",
    "Yjs merges edits",
  );
  assert.deepEqual(checkAdrs(files), [
    `${note2}: title must read "# ADR-NOTE-002. How …?"`,
  ]);
});

test("a status or date outside the format is reported", () => {
  const files = edit(
    valid(),
    note2,
    "- Status: Accepted",
    "- Status: Superseded",
  );
  edit(files, note2, "- Date: 2026-10-17", "- Date: October 17");
  edit(
    files,
    "apps/notes/docs/adr/README.md",
    "| Yjs | Accepted |",
    "| Yjs | Superseded |",
  );
  assert.deepEqual(checkAdrs(files), [
    `${note2}: Status must be Proposed, Accepted or Deprecated`,
    `${note2}: Date must be YYYY-MM-DD`,
  ]);
});

test("sections must be the template's, in its order, with the required ones present", () => {
  const files = edit(valid(), note2, "## Evidence\n- A test.\n\n", "");
  edit(
    files,
    note2,
    "## Consequences",
    "## Notes\n- Extra.\n\n## Consequences",
  );
  edit(
    files,
    note2,
    "## Context",
    "## Changelog\n- 2026-10-17: Accepted.\n\n## Context",
  );
  assert.deepEqual(checkAdrs(files), [
    `${note2}: sections must be Context, Decision, Alternatives considered (optional), Evidence, Consequences, Changelog (optional), in that order; found Changelog, Context, Decision, Notes, Consequences`,
  ]);
});

test("an ADR outside its namespace's folder is reported", () => {
  const files = valid();
  const text = files.get(note2)!;
  files.delete(note2);
  files.set("docs/adr/ADR-NOTE-002-merging-edits.md", text);
  for (const [file, content] of files)
    files.set(
      file,
      content.replaceAll(
        "ADR-NOTE-002-merging-edits.md",
        "../../../../docs/adr/ADR-NOTE-002-merging-edits.md",
      ),
    );
  const problems = checkAdrs(files);
  assert.ok(
    problems.includes(
      "docs/adr/ADR-NOTE-002-merging-edits.md: NOTE ADRs belong in apps/notes/docs/adr/",
    ),
    problems.join("\n"),
  );
});

const note1 = "apps/notes/docs/adr/ADR-NOTE-001-offline-use.md";
const plat1 = "docs/adr/ADR-PLAT-001-toolchain.md";

test("an ADR the body mentions must be in Depends on or Dependency of", () => {
  const files = edit(
    valid(),
    note2,
    "- A cost.",
    "- A cost for [ADR-PLAT-001](../../../../docs/adr/ADR-PLAT-001-toolchain.md).",
  );
  assert.deepEqual(checkAdrs(files), [
    `${note2}: mentions ADR-PLAT-001 but lists it in neither Depends on nor Dependency of`,
  ]);
});

test("the Changelog may mention any ADR", () => {
  const files = edit(
    valid(),
    note2,
    "- A cost.\n",
    "- A cost.\n\n## Changelog\n- 2026-10-17: Moved here from [ADR-PLAT-001](../../../../docs/adr/ADR-PLAT-001-toolchain.md).\n",
  );
  assert.deepEqual(checkAdrs(files), []);
});

test("dependency lists mirror each other", () => {
  const files = edit(
    valid(),
    note1,
    "- Dependency of: [ADR-NOTE-002](ADR-NOTE-002-merging-edits.md)",
    "- Dependency of: none",
  );
  assert.deepEqual(checkAdrs(files), [
    `${note2}: depends on ADR-NOTE-001, which does not list it under Dependency of`,
  ]);
});

test("a dependency list is sorted, names each ADR once and shares none with the other list", () => {
  const files = edit(
    valid(),
    note1,
    "- Depends on: [ADR-PLAT-001](../../../../docs/adr/ADR-PLAT-001-toolchain.md)",
    "- Depends on: [ADR-PLAT-001](../../../../docs/adr/ADR-PLAT-001-toolchain.md), [ADR-NOTE-002](ADR-NOTE-002-merging-edits.md), [ADR-PLAT-001](../../../../docs/adr/ADR-PLAT-001-toolchain.md)",
  );
  assert.deepEqual(checkAdrs(files), [
    `${note1}: Depends on must be sorted by ID and name each ADR once`,
    `${note1}: ADR-NOTE-002 is in both Depends on and Dependency of`,
    `${note1}: depends on ADR-NOTE-002, which does not list it under Dependency of`,
  ]);
});

test("a PLAT ADR depends only on PLAT ADRs", () => {
  const files = edit(
    valid(),
    plat1,
    "- Depends on: none",
    "- Depends on: [ADR-NOTE-002](../../apps/notes/docs/adr/ADR-NOTE-002-merging-edits.md)",
  );
  edit(
    files,
    note2,
    "- Dependency of: none",
    "- Dependency of: [ADR-PLAT-001](../../../../docs/adr/ADR-PLAT-001-toolchain.md)",
  );
  assert.deepEqual(checkAdrs(files), [
    `${plat1}: PLAT ADRs depend only on PLAT ADRs, not ADR-NOTE-002`,
  ]);
});

test("a gap in a namespace's numbers is reported", () => {
  const files = valid();
  const text = files.get(note2)!.replace("# ADR-NOTE-002.", "# ADR-NOTE-003.");
  files.delete(note2);
  files.set("apps/notes/docs/adr/ADR-NOTE-003-merging-edits.md", text);
  for (const [file, content] of files)
    files.set(file, content.replaceAll("ADR-NOTE-002", "ADR-NOTE-003"));
  assert.deepEqual(checkAdrs(files), [
    "apps/notes/docs/adr/: NOTE numbers must run 1, 2, 3… with no gaps; found 1, 3",
  ]);
});

test("each folder's index has one row per ADR, matching its title and status", () => {
  const index = "apps/notes/docs/adr/README.md";
  const files = edit(
    valid(),
    index,
    "| How do edits merge? | Yjs | Accepted |",
    "| How are edits merged? | Yjs | Proposed |",
  );
  edit(files, index, /\| \[ADR-NOTE-001\].*\n/, "");
  assert.deepEqual(checkAdrs(files), [
    `${index}: has no row for ADR-NOTE-001`,
    `${index}: the ADR-NOTE-002 row must read "| [ADR-NOTE-002](ADR-NOTE-002-merging-edits.md) | How do edits merge? | … | Accepted |"`,
  ]);
});

test("links inside code are examples, not links", () => {
  const files = valid();
  files.set(
    ".agents/skills/adr/SKILL.md",
    "Write `[ADR-NOTE-001](ADR-NOTE-001-offline-use.md)`.\n\n```md\n[ADR-NOTE-002](ADR-NOTE-002-x.md)\n```\n",
  );
  assert.deepEqual(checkAdrs(files), []);
});
