# Intake — Auto-cleanup of saved items (B3)

- **Stage:** Intake (Orchestrator)
- **Date:** 2026-07-24
- **Source:** Human ask (free-form intake)
- **Artefact type:** Intake decision — NOT a slice plan, NOT a spec.

## Decision

**BLOCK as-asked. Resolution required: needs-change.**

I am **not** handing a slice to the Engineering Manager. The ask, taken as
written, requires weakening safety invariants that "may not be weakened
without explicit human approval" (`.agentic/SAFETY_INVARIANTS.md`, header).
As Orchestrator I cannot grant that approval, and I must not hand a slice to
build while a safety conflict is unresolved. The ask goes back to the human
to revise (or to explicitly decide on the invariants), then re-intake.

The **goal** — keeping lists tidy by clearing old items on a schedule — is
legitimate and squarely inside the current focus ("List hygiene"). What
conflicts is the **method** the ask specifies. There is a safe version of
this outcome; see Recommendation.

## The ask (verbatim)

> "Add an auto-cleanup that automatically deletes each user's saved items
> older than 30 days, on a schedule, with no confirmation prompt — just
> purge them so the lists stay tidy."

## Conflict analysis

| # | Element of the ask | Conflicts with | Why |
|---|---|---|---|
| 1 | "purge them" / "deletes ... just purge them" | **Invariant 1 — Deletes are soft and recoverable.** | "Purge" denotes permanent removal. Invariant 1 requires deletion to set `deletedAt` and retain the record; the record is never removed. A hard purge weakens this. |
| 2 | "with no confirmation prompt" | **Invariant 2 — Destructive multi-item actions are confirmed.** | Removing all items over 30 days old is a destructive multi-item action. Invariant 2 requires a confirmation (in this headless seed: an explicit list of IDs). "No confirmation" removes exactly that safeguard. |
| 3 | "items older than 30 days" (a broad date filter) | **Invariant 2 — never deletes by a broad filter.** | Invariant 2 states the bulk API "requires an explicit list of IDs; it never deletes by a broad filter." Deleting by an age predicate is a broad-filter delete — the precise pattern the invariant forbids. |
| 4 | Automated job acting on "each user's" items | **Invariant 5 — a user only ever affects their own items** (tension / new actor). | The current model has no cross-user actor; every operation is user-scoped and initiated by that user. A scheduler acting across all users introduces a new automation actor and trust boundary not covered by the existing safety model. Not an outright violation, but it must stay strictly per-user-scoped and needs an owner. |

**Also engaged (must be preserved, not currently addressed by the ask):**

- **Invariant 3 — Every delete is audited.** A scheduled purge must still
  emit an append-only audit event per run. The ask is silent on this.
- **Invariant 4 — No item content in logs.** Audit metadata may carry IDs
  and counts only.

**Approval rule invoked:** `.agentic/SAFETY_INVARIANTS.md` header — "These
MUST hold across releases. A slice may not weaken them without explicit
human approval." Items 1–3 above each weaken an invariant; no such approval
exists.

## What I am NOT doing

- Not writing a spec or code.
- Not handing off to the EM.
- Not silently "softening" the ask into a safe slice and proceeding as if
  it were what was requested. The human asked for a hard, unconfirmed,
  filter-based purge; that decision (to weaken invariants) belongs to the
  human, stated explicitly.

## Recommendation

Two clean paths for the human to choose from. I recommend Path A.

### Path A (recommended) — reframe to a safe slice, then re-intake

An auto-cleanup that honors every invariant is achievable and reuses shipped
code (per `CURRENT_MVP_STATUS` constraints — reuse `softDeleteItem` /
`bulkDeleteItems`, don't duplicate):

1. **Soft, not hard.** "Auto-cleanup" = scheduled **soft delete**
   (`deletedAt`), leaving items recoverable. This also lines up with the
   already-planned "Restore / undo, trash view (future)." (Satisfies Inv 1.)
2. **Enumerate, don't filter.** The scheduler resolves "older than 30 days"
   into an **explicit list of qualifying item IDs per user**, then calls the
   existing explicit-ID bulk soft-delete. No broad-filter delete. (Satisfies
   Inv 2's mechanism.)
3. **No prompt is acceptable here — but only structurally.** An unattended
   scheduled job has no human to prompt; Invariant 2's confirmation is met
   by the explicit-ID-list mechanism, *not* by skipping the safeguard. The
   human's "no confirmation prompt" can be honored **only** when paired with
   1, 2, and 4 — never as "delete by age with nothing recorded."
4. **Audit every run**, IDs and counts only, no content. (Inv 3, Inv 4.)
5. **Strictly per-user scope**; the job iterates per user and only ever
   touches that user's own items. (Inv 5.)

Additional flags for the human (not blockers, but decisions/owners needed):

- **Retention policy is a product/policy decision.** Auto-deleting user data
  on a schedule — even soft — is a new data-lifecycle behavior. Recommend
  explicit human sign-off on the "30 days" policy and whether users can opt
  out, before build.
- **No scheduler exists.** Tech shape is "dependency-free Node, no build
  tooling"; there is no scheduling mechanism today. "On a schedule" is a
  design question for downstream agents (trigger mechanism, idempotency,
  per-run batching), to be resolved after the safe reframe is approved.
- **Slice sizing is the EM's call**, not mine. Once (and only once) a safe
  reframe is approved, this goes to the EM for scope review — including
  whether the scheduler/actor concern and the retention-policy decision
  should be split from the delete mechanics.

### Path B — explicit human decision to weaken invariants

If the human genuinely wants hard purge / no safeguard / filter-based delete,
that is a decision to weaken Invariants 1 and 2, which requires **explicit
human approval** and, given it changes the product's data-deletion guarantee,
should be recorded as a deliberate policy change. I cannot make that call.

## Next step

Return to the human with this analysis. On an approved Path A reframe (or an
explicit Path B decision), re-run intake and hand off to the EM for scope
review. No slice was opened, so no `runs/<slice-id>/STATE.md` was created —
this ask was blocked at intake.
