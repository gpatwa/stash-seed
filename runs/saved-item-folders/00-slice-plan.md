# Slice Plan — saved-item-folders

## One-line outcome

Users can create folders and organize saved items into them, so list
hygiene isn't limited to delete-only ("Not yet built: Restore / undo,
trash view" in `CURRENT_MVP_STATUS.md` is adjacent but out of scope here —
this slice is about *organizing what you keep*, not recovering what you
deleted).

## Project pack

`project-packs/b2c-saas.md` — individual buyer, low-friction, fast task
completion. No teams/sharing/RBAC (out of scope per `PROJECT_CONTEXT.md`).

## Release tier

**Tier 2** — behavioural change, no external effect (new internal data
model + API surface, no send/submit, no deploy-specific risk beyond the
standard release gate).

## Human-approval scan (Intake, per `HUMAN_APPROVAL_RULES.md`)

Walked all 6 rules against this ask. **None trip:**

1. Send/submit on behalf of a user — no.
2. Destructive operations on shared state — no; additive (new entity +
   assignment), not a delete/drop/force-push.
3. External-effect deploy/release — not tripped by the ask itself; the
   standard Release-stage deploy approval still applies later, as always.
4. Changes to safety controls — no. Checked against all 7 of this repo's
   invariants (`SAFETY_INVARIANTS.md`); folders don't touch soft-delete,
   bulk-delete confirmation, audit coverage, log content, user-scoping,
   the LLM-throws invariant, or the bind-to-localhost invariant.
   Implementation must still *respect* invariant 5 (user-scoped) for
   folder operations — that's a QA/Security correctness check, not a
   pre-approval trigger.
5. Inviting an LLM into a deterministic path — no.
6. New third-party data processor — no, purely internal data model.

**Result: proceed without pausing for approval.**

## Stages that will run

Following the precedent set by this repo's own prior traces
(`email-digest`: `Scope → Architecture → Implementation → QA → Security →
Release → Post-Launch`) — this is a headless, UI-less service, so
Discovery/UX Research/UI Design are compressed the same way every prior
real run here compressed them (no user-visible UI surface to spec).
Market Research is skipped — this is a well-understood, EM-scoped
extension of existing list-hygiene work, not a novel/fuzzy ask.

1. **Intake** (this document) — Orchestrator.
2. **Scope Review** — Engineering Manager. Size the slice, confirm
   non-goals, confirm the gate list.
3. **Architecture** — Software Architect. **Must actually run** (not be
   compressed) — this slice needs a real data-model decision (new
   `folders` entity, item↔folder relationship, migration path for
   existing items with no folder) and an adapter-boundary check.
4. **Implementation** — Backend Architect (this repo has no frontend
   surface; `backend-architect.md` owns `src/services/`).
5. **QA Evidence** — QA Evidence Agent.
6. **Security Review** — Security & Privacy Agent.
7. **Release Gate** — Release Manager.
8. **Post-Launch** — Post-Launch Learning Agent.

## Success criteria

- A user can create a named folder.
- A user can assign a saved item to at most one folder (simplest model —
  no nested folders, no multi-folder membership in v1).
- `listItems` can filter by folder.
- Deleting a folder does not delete its items (items become unfoldered,
  never destroyed — consistent with invariant 1, soft-delete-recoverable
  philosophy extended to folders: nothing about organizing should be able
  to destroy content).
- Every folder-affecting action is user-scoped (invariant 5) and, where it
  changes state, audited (extending invariant 3's spirit — not itself a
  delete, but state-changing actions elsewhere in this codebase are
  audited, and Security Review should confirm whether folder create/
  assign/delete-folder needs the same treatment).
- Existing `addItem`/`listItems`/`softDeleteItem`/`bulkDeleteItems`
  behavior is unchanged for items with no folder.

## Non-goals

- Nested folders / folder hierarchies.
- An item belonging to more than one folder.
- Sharing a folder with another user (teams/RBAC is out of scope per
  `PROJECT_CONTEXT.md`).
- Any UI — this is a headless service; the surface is the service API.
- Bulk folder operations (bulk-assign, bulk-move) — v1 is single-item
  folder assignment only, matching how `addItem`/`softDeleteItem` started
  single-item before `bulkDeleteItems` was added later as its own slice.

## Constraints

- Dependency-free Node ESM, no build tooling (`PROJECT_CONTEXT.md`).
- Reuse the existing audit pattern (`recordAuditEvent`) rather than
  inventing a parallel one (`CURRENT_MVP_STATUS.md`'s standing constraint
  for this codebase).
- `main` requires a PR + the "Release gates" CI check passing —
  branch protection is live on this repo now (T4). This slice lands via a
  branch + PR, not a direct push.

## Next action

Hand off to Engineering Manager for Scope Review.
