---
name: adr
description: Write or edit this repo's Architecture Decision Records (ADRs). Use when recording a settled decision, changing or dropping an existing decision, or adding an app's ADR folder. Takes precedence over domain-modeling's ADR-FORMAT.md.
---

# ADRs

Each topic has **one living ADR** that always states the current decision. When a decision changes, its ADR is rewritten in place and a **Changelog** entry records what changed and why. Git keeps the old wording.

ADRs live in `docs/adr/` (decisions that hold for every app) and `apps/<app>/docs/adr/` (decisions for one app). Each folder has a `README.md` holding its index table and its **Not decided yet** table.

## Steps

1. **Find the topic's ADR.** List every ADR folder (`ls docs/adr apps/*/docs/adr`) and read the index READMEs. The work is a new ADR only when no existing ADR covers the topic; otherwise it is an edit to that ADR.
2. **Write the change.**
   - **New decision:** take the next free number across every ADR folder, and fill in the [template](#template) in the folder the [location rule](#rules) picks.
   - **Changed decision:** rewrite Context, Decision, Evidence and Consequences to describe the decision as it now stands, set Date to today, and add a Changelog entry. If the title changes, rename the file's slug to match.
   - **Dropped decision with no replacement:** set Status to `Deprecated`, say so in Decision, and add a Changelog entry.
   - **Two ADRs turn out to cover one topic:** fold the newer into the older, which keeps its number; the newer number is retired. Add a Changelog entry to the survivor.
3. **Update the index.** The folder README's table has one row per ADR, matching its number, title, Depends on and Status. Move a settled topic out of **Not decided yet**.
4. **Reconcile links.** Done when every link to a renamed or retired ADR file points at its current file (search the whole repo, including specs and research), every relative ADR link resolves, and each ADR's Depends on / Dependency of lists mirror each other across every folder.

## Template

```md
# N. <Title>

- Status: Proposed | Accepted | Deprecated
- Date: YYYY-MM-DD
- Depends on: [ADR A](…), [ADR B](…)   (or "none")
- Dependency of: [ADR C](…)            (or "none")

## Context
## Decision
## Evidence
## Consequences
## Changelog
```

The Changelog section appears once the decision first changes. Each entry is one bullet, newest last:

```md
- YYYY-MM-DD: <what changed>, because <why>. <PR or research link>
```

## Rules

- **When:** an ADR records a settled decision. Open questions go in the folder README's **Not decided yet** table.
- **Title:** the decision itself, as one declarative sentence in the present tense and sentence case, with no colon and no trailing period. For example, "Yjs stores all shared data", not "Using Yjs" or "CRDT choice".
- **Location:** an ADR that holds for every app goes in `docs/adr/`. One that holds for a single app goes in `apps/<app>/docs/adr/`. When an app's decision turns out to hold for every app, a platform ADR states it, and the app's ADR then depends on it. A new app's ADR folder gets a README with the index and **Not decided yet** tables, linking back to the platform README.
- **Number:** a unique ID across the whole repo, kept for the life of the topic. Retired numbers stay retired, so each folder's numbers have gaps.
- **File name:** `NNNN-` plus a short slug of the current title.
- **Voice:** impersonal and present tense, describing the system as it is ("The server stores…"). No "we", and no contractions. "Must" marks a rule that code review enforces.
- **Context** is a short prose paragraph: the forces and constraints, without the decision.
- **Decision**, **Evidence** and **Consequences** are bullet lists. Evidence cites a PR, a test or a research document, and links research documents. When no spike backs a decision yet, Evidence says so.
- **Changelog** records the reason for each change, with a link to the PR or research behind it, in a sentence or two. The current decision lives in the body.
- **References:** every mention of another ADR is a link (`[ADR N](file)`), with a relative path when the ADR is in another folder. Each ADR referenced in the body also appears in **Depends on** (decisions this one builds on) or **Dependency of** (decisions built on this one). A platform ADR depends only on platform ADRs.
