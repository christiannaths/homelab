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
   - **New decision:** take the number after the highest one across every ADR folder, and fill in the [template](#template) in the folder the [location rule](#rules) picks.
   - **Changed decision:** rewrite the Context, Decision, Evidence, Consequences, dependency lists and Date to state the new decision as if it had always been the decision, and add a Changelog entry.
   - **Dropped decision with no replacement:** set Status to `Deprecated`, say so in Decision, and add a Changelog entry.
   - **Two ADRs turn out to cover one topic:** fold the newer into the older, which keeps its number. Every ADR numbered after the freed number moves down one, so the numbers stay gapless. Add a Changelog entry to the survivor.
   - **Wording, links or dependency lists only:** edit freely, with no Changelog entry.
3. **Update the index.** The folder README's table has one row per ADR, matching its number and title (the **Question** column), a one-line summary of the current outcome (the **Decision** column), Depends on and Status. The Decision column is the one place that names the outcome outside the ADR body, and it changes whenever the decision does. Move a settled topic out of **Not decided yet**.
4. **Reconcile links.** Done when every link to a renumbered or merged ADR file points at its current file (search the whole repo, including specs, research and spikes), every relative ADR link resolves, and each ADR's Depends on / Dependency of lists mirror each other across every folder.

## Template

```md
# N. <Question?>

- Status: Proposed | Accepted | Deprecated
- Date: YYYY-MM-DD
- Depends on: [ADR A](…), [ADR B](…)   (or "none")
- Dependency of: [ADR C](…)            (or "none")

## Context
## Decision
## Evidence
## Consequences
## Changelog          (once the decision has changed)
```

## Rules

- **When:** an ADR records a settled decision. Open questions go in the folder README's **Not decided yet** table.
- **Status:** `Proposed` while the decision is open for review, `Accepted` once it holds, and `Deprecated` when it is dropped with nothing replacing it. A changed decision stays `Accepted`.
- **Date:** the day the current decision was accepted.
- **Changelog:** the last section, one dated bullet per entry, newest first (`- YYYY-MM-DD: …`). An ADR whose decision has never changed leaves it out. The first change adds the section with two entries: the change, and below it the original decision (`- YYYY-MM-DD: Accepted. <what it was>`). Each entry says what changed and **why**, linking the PR or research document behind it; the current decision lives in the body.
- **Title:** the problem the ADR decides, as one question in sentence case ending with a question mark. It names no option, product or outcome, so it stays the same when the decision changes. For example, "Where does the server store document state?", not "The server stores document state in SQLite" or "SQLite storage". The outcome goes in **Decision**.
- **Location:** an ADR that holds for every app goes in `docs/adr/`. One that holds for a single app goes in `apps/<app>/docs/adr/`. When an app's decision turns out to hold for every app, a platform ADR states it, and the app's ADR then depends on it. A new app's ADR folder gets a README with the index and **Not decided yet** tables, linking back to the platform README.
- **Number:** numbers run 1, 2, 3… across the whole repo with no gaps, and each means one topic. The folders share one sequence, so each folder's own numbers skip the ones other folders hold. A number changes only when a merge frees a lower one, and then every link and mention is updated.
- **File name:** `NNNN-` plus a slug naming the problem from the title in two or three lowercase words, as a noun phrase: `offline-use`, `server-storage`, `page-access-levels`. Like the title, it names no option or outcome (`server-storage`, not `sqlite-storage`).
- **Voice:** impersonal and present tense, describing the system as it is ("The server stores…"). No "we", and no contractions. "Must" marks a rule that code review enforces.
- **Context** is a short prose paragraph: the forces and constraints, without the decision.
- **Decision**, **Evidence** and **Consequences** are bullet lists. Evidence cites a PR, a test or a research document, and links research documents. When no spike backs a decision yet, Evidence says so.
- **References:** every mention of another ADR is a link (`[ADR N](file)`), with a relative path when the ADR is in another folder. Each ADR referenced in the body also appears in **Depends on** (decisions this one builds on) or **Dependency of** (decisions built on this one). Each list is in number order, and no ADR appears twice or in both lists. A platform ADR depends only on platform ADRs.
