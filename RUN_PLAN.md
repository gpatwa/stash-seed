# Live Multi-Agent Run — Plan

This repo is the target for a **live** run of the Agentic SDLC playbook
(`../agentic-sdlc-playbook`). Real role-agents, each loaded only with their
brief + this repo's `.agentic/` + the prior stage's artefact, implement a
real feature on this codebase and pass it through the gates.

## What we're proving

That agents — given narrow briefs and artefact handoffs, *not* the whole
conversation — can actually execute the pipeline and produce working code
that holds the safety invariants. (The paper worked example in the playbook
proved the process *composes*; this proves agents can *run* it.)

## The slice

> "Let a user select several saved items and delete them together, without
> making accidental mass-deletion easy."

Same slice as the playbook's worked example, so that example serves as a
private answer key. Agents do **not** get the answer key — only their brief,
the ask, this repo, and the prior artefact.

## Roles & order (compressed pipeline)

The parent session acts as **Orchestrator + Engineering Manager** (scopes,
sequences, feeds artefacts between agents). Market Research / PM / UX / UI
are compressed for this small, well-understood slice. Spawned role-agents:

| # | Role | Reads | Produces |
|---|------|-------|----------|
| 1 | Software Architect | brief + `.agentic` + seed code + the ask | `runs/<id>/tech-spec.md` |
| 2 | Engineer (Backend) | brief + tech spec + seed code | code + tests on the repo; `runs/<id>/impl-notes.md` |
| 3 | QA Evidence | brief + diff + `.agentic` | re-runs `qa:mvp`; `runs/<id>/qa-evidence.md` |
| 4 | Security & Privacy | brief + diff + QA evidence | `runs/<id>/security-review.md` |

## Gates enforced

- Implementation: `npm run typecheck`, `npm test`, `npm run build` green.
- QA: independent `npm run qa:mvp`; safety invariants 1–5 verified.
- Security: audit coverage, no item content in logs, user-scoping, no
  approval bypass.
- Release tier: **Tier 2** (behavioural, no external effect) — no
  human-approval gate triggered.

## How success is judged

1. The seed's existing tests still pass (no regression).
2. New bulk-delete behaviour works and is covered by new tests.
3. Safety invariants 1–5 hold (verified by QA + Security, not asserted).
4. The independently-produced design lands in the same ballpark as the
   answer key (reuse `softDeleteItem`, one audit event per batch,
   user-scoped, soft delete).

## Where artefacts land

Each run writes to `runs/<run-id>/`. Code changes are committed on a branch
so the diff is reviewable. Nothing is pushed without human approval.

## Honest limits

The parent coordinates handoffs; agents don't talk to each other directly.
That's faithful to the playbook (handoffs go through artefacts), but the
parent is doing the EM's sequencing by hand.
