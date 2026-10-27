---
name: adr
description: Write or edit this repo's Architecture Decision Records (ADRs). Use when recording a settled decision, changing, merging or dropping an existing one, or giving an app its ADR folder. Takes precedence over domain-modeling's ADR-FORMAT.md.
---

# ADRs

An ADR records a **durable, foundational decision**: one that other decisions build on and that holds for the life of the app. Each problem has **one living ADR** that always states the current decision; when the decision changes, its ADR is rewritten in place and its Changelog says why. Short-lived constraints, such as a dependency version pin, live in issues.

## When

An ADR changes in the same PR as the code that makes its decision true, so the ADRs always describe what is built. A spec lists the ADRs its build will edit, and when it is split into tickets, each ticket names the ADRs its own PR edits. ADRs are not written ahead of the code during design.

## Steps

1. **Find the problem's ADR.** Read the index README in each ADR folder (`ls docs/adr apps/*/docs/adr`). An existing ADR whose problem covers the change is the one to edit; a new problem gets a new ADR.
2. **Write the change.**
   - **New decision:** take the next number in the namespace, and fill in the [template](#template) in that namespace's folder.
   - **Changed decision:** rewrite Context, Decision, Alternatives considered, Evidence, Consequences, the dependency lists and Date to state the new decision as the decision, and add a Changelog entry.
   - **Dropped decision with nothing in its place:** set Status to `Deprecated`, state it in Decision, and add a Changelog entry.
   - **Two ADRs on one problem:** fold the newer into the older, which keeps its ID, and add a Changelog entry to the survivor. The ADRs after the freed number each move down one, so the namespace stays gapless.
   - **Deleted ADR:** the ADRs after it move down one in the same way.
   - **Wording, links or dependency lists only:** edit freely; the Changelog records decisions only.
3. **Update the index.** The folder README's table has one row per ADR: its ID, its title (**Problem**), a one-line summary of the current outcome (**Decision**) and its Status. Move a settled topic out of **Not decided yet**.
4. **Reconcile references.** Update every ID and link across the repo (ADRs, READMEs, specs, research, spikes and code comments) to the ADR's current ID and file. Done when `npm run adrs` passes: it checks every rule in this skill that a script can, from file names to mirrored dependency lists.

## Template

```md
# ADR-<NS>-<NNN>. How <problem>?

- Status: Proposed | Accepted | Deprecated
- Date: YYYY-MM-DD
- Depends on: [ADR-<NS>-<NNN>](…), … (or "none")
- Dependency of: [ADR-<NS>-<NNN>](…), … (or "none")

## Context

## Decision

## Alternatives considered (when options were weighed)

## Evidence

## Consequences

## Changelog (once the decision has changed)
```

## Rules

### IDs and files

- **Namespace:** each ADR folder has one upper-case code of 3 or 4 letters, listed in the platform README's namespace table. `PLAT` is `docs/adr/`, for decisions that hold for every app; each app has its own code for `apps/<app>/docs/adr/` (`NOTE` for Notes). A new app's folder gets a code in that table and a README with the index and **Not decided yet** tables, linking back to the platform README.
- **ID:** `ADR-<NS>-<NNN>`, with a 3-digit number counting 1, 2, 3… within its namespace. The ID is written the same way everywhere: file name, title, links, prose and code comments (`// ADR-NOTE-009: …`).
- **File name:** `ADR-<NS>-<NNN>-<slug>.md`. The slug names the problem in two or three lowercase words, as a noun phrase: `offline-use`, `document-persistence`, `page-permissions`.
- **Location:** a decision that holds for every app is a `PLAT` ADR, and an app's decision that builds on it lists it in Depends on.

### Title

The problem the ADR solves, as one "How…?" question in sentence case: the need, in words that stay true whatever the answer turns out to be. For example, "How does the server keep documents safe across restarts?" or "How does an instance know who is editing?". A product that an ADR this one depends on already chose may appear as part of the problem. The outcome lives in Decision and in the index's Decision column.

### Sections

- **Status:** `Proposed` while open for review, `Accepted` once it holds, `Deprecated` when dropped with nothing in its place. A changed decision stays `Accepted`.
- **Date:** the day the current decision was accepted.
- **Context:** two or three sentences on the forces and constraints that make this a problem.
- **Decision:** a bullet list of what holds now.
- **Alternatives considered:** one bullet per option weighed, the option in bold, followed by the reason the decision differs.
- **Evidence:** a bullet list citing PRs, tests and research documents, with research documents linked. When nothing has tested a decision yet, Evidence says what it rests on.
- **Consequences:** a bullet list of what follows from the decision: costs, constraints on later work, and the conditions under which the decision changes.
- **Changelog:** the last section, one dated bullet per entry, newest first (`- YYYY-MM-DD: …`). The first change adds the section with two entries: the change, and below it the original decision (`- YYYY-MM-DD: Accepted. <what it was>`). Each entry says what changed and **why**, linking the PR or research document behind it.

### Writing

- **Brevity:** as little prose as possible. Tables for anything with rows (settings, touch points, accounts, options). Short bullets; fragments are fine. One line per Evidence item: the test or PR, then what it shows.
- **Once:** each fact lives in one place. Don't restate what the code, a README or another ADR already says; link to it.
- **Voice:** present tense, describing the system as it is. Plain words; contractions are fine. "Must" marks a rule that code review enforces.
- **Content:** each line carries a durable fact, rule or reason. Counts and timings appear with what they were measured on.
- **References:** every mention of another ADR is a link (`[ADR-NOTE-009](ADR-NOTE-009-identity.md)`), with a relative path across folders. Each ADR referenced in the body appears in **Depends on** (decisions this one builds on) or **Dependency of** (decisions built on this one). Each list is sorted by ID, names each ADR once, and mirrors the other ADR's list. `PLAT` ADRs depend only on `PLAT` ADRs.
