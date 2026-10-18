---
name: comments
description: Write or review code comments, doc comments and lint-disable directives. Use when adding, editing or reviewing a comment, or deciding whether code needs one.
---

# Comments

A comment carries the **why**: knowledge a reader needs that the code itself cannot hold. The code already says what it does; names, types, small functions and tests are how it says that clearly.

## Steps

1. **Name the why.** Before writing a comment, state in one sentence the reason, constraint or surprise it records. With no such sentence, improve the code instead: a clearer name, an extracted function, a type, or a test that pins the behaviour.
2. **Write it where the surprise is.** Put the comment on the line or block that looks wrong without it, in plain present-tense prose, as short as the reason allows.
3. **Check it against the code.** Done when every comment in the diff states a why that is true of the code as it now stands, and every comment the change made stale is updated or removed.

## What earns a comment

- **A workaround** for a tool, library or platform quirk, naming the quirk: `// On a plugin error Nx still writes a partial graph and exits 0, so check its output too.`
- **A constraint from outside the code**: a protocol, a limit, a security rule, an ordering a caller depends on.
- **A decision with a record**: cite the ADR by ID (`// ADR-NOTE-010: every update is reviewed before it is applied.`), so the reasoning stays in one place.
- **A non-obvious invariant or edge case** the code relies on, such as why a check runs twice or why a value may be empty.
- **A doc comment on an exported interface**, stating what a caller must know and cannot see from the signature: units, ownership, side effects, error cases.
- **A lint-disable directive**, always with its reason after `--`: `// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the file is Nx's own graph output.`

## Where the knowledge belongs instead

- **What the code does** goes into names and structure.
- **History** (what changed, who changed it, the old approach) goes into the commit message and the PR.
- **Plans and open work** go into a GitHub issue; a comment may link it.
- **Removed code** lives in git history.
