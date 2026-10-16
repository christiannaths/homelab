# 1. Record architecture decisions

- Status: Accepted
- Date: 2026-10-16

## Context
LocalNotion began with two spikes (PR #1 and PR #2) that tested risky ideas. Some of those ideas are now settled, and others are still open. We need one place that says which is which, so later work doesn't reopen settled questions or quietly lock in open ones.

## Decision
- We record architecture decisions as short ADRs in `docs/adr/`, numbered in order.
- An ADR is written only once the decision is settled, either because it's a stated requirement or because it's backed by evidence.
- Open questions are listed in [`README.md`](README.md) under "Not decided yet", not written up as ADRs.
- An accepted ADR is never edited to change its decision. A new ADR supersedes it, and the old one is marked `Superseded by N`.
- `research/` holds exploration (surveys, spike findings). ADRs link to it as evidence.

## Consequences
- A missing ADR means "not decided". Anyone can make that call later without undoing anything.
- Each ADR names the evidence behind it, so it's clear what new evidence would justify superseding it.
