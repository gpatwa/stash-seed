# Scope Review — email-digest

> Stage 2 · Owner: Engineering Manager
> Status: done — handing to Software Architect

## Decision

**APPROVED as one slice — no split.** Proceed to Architecture.

## Size check

Existing surface (read for sizing): `src/services/savedItems.js` (exports
`addItem`, `listItems`, `softDeleteItem`, `bulkDeleteItems`),
`src/services/audit.js` (exports `recordAuditEvent`, `listAuditEvents`),
one test file. No user/email-directory service exists anywhere in the repo.

Estimated footprint (filenames indicative — Architect's call, count is
what matters):

| File | Change |
|------|--------|
| `emailAdapter.js`-equivalent | new — `EmailAdapter` contract + `PlaceholderEmailAdapter` (throws by default) |
| `digest.js`-equivalent | new — `sendItemsDigest(userId)`: composes via `listItems`, calls adapter, emits one audit event via `recordAuditEvent` |
| `digest.test.js`-equivalent | new — composition, throw-by-default, audit shape, user-scoping |

**~3 new files, 0 modified.** Well under the 10-file / non-refactor cap.
Pure addition — nothing in `savedItems.js`/`audit.js` needs to change,
only reuse of existing exports. No mixing of user-facing behaviour with
refactor. One implementation pass. **No split required.**

## Stage/compression decision

Confirms the slice plan's proposed sequence as-is: Scope (EM) →
Architecture → Implementation → QA → Security → Release → Post-Launch.

- **Market Research: skip.** Already decided at intake — internal,
  well-understood ask.
- **UX/UI Design: skip.** Headless seed; repo has no view/UI layer at all
  (`src/` contains services only) — there is no stage here to compress.
- **Discovery/PM: not run.** Slice plan already gives the function intent,
  success criteria and non-goals; no open product question.
- **Architecture: full, not stubbed.** This introduces a new seam
  (`EmailAdapter`) and a new audit-metadata shape (recipient-hash) — real
  design work, not a one-paragraph stub.
- **QA and Security: full, not compressed.** Tier 3 plus a live rule-1
  approval means these cannot be shortened for speed.

Rationale: small, additive, single-boundary change with scope already
approved. Splitting further would fragment one coherent unit (interface +
composer + tests) across artificial lines.

## Scoped work item — for the Software Architect

**Design:**
1. `EmailAdapter` contract + `PlaceholderEmailAdapter` implementing it,
   throwing by default (e.g. "Email sending is not configured in this
   build"). Deterministic — no network call, no real provider; tests run
   without one.
2. `sendItemsDigest(userId)` — composes the digest from the user's *live*
   items only, via `listItems(userId)` (already user-scoped, already
   filters `deletedAt` — do not duplicate that filtering). Calls the
   adapter, then emits one audit event via `recordAuditEvent`, mirroring
   the existing `bulkDeleteItems` pattern (validate → do the work → one
   summary audit event).
3. Audit event: new type (e.g. `items.digest_sent`); metadata = item IDs +
   count + a recipient-hash only — never item title/content (invariant 4).
   No existing event carries a "recipient" field, so the Architect must
   define the hashing approach and *not* log the raw recipient identifier.
4. **Open question, Architect's to resolve:** does the audit event fire
   only after a successful `adapter.send()`, or also on an "attempted"
   path when the placeholder throws? Since the placeholder always throws
   in this build, "digest composed correctly" must be testable as a step
   independent of the adapter call, or it can never be verified —
   composition and sending should be separable for testability.

**Explicit non-goals:**
- No real email provider; no code path that can actually send mail in this
  build (approval scope; rule 6 is a separate future request).
- No scheduling/cron. No unsubscribe management. No HTML/template polish.
- No changes to `softDeleteItem`, `bulkDeleteItems`, `listItems`, or
  `recordAuditEvent` behaviour — reuse only.
- No new user/email-directory lookup subsystem. None exists today; accept
  a recipient identifier as an explicit parameter rather than building
  user-profile infrastructure — that would exceed both the file budget
  above and the approved scope. No UI (none exists).

**Constraints carried in:**
- Safety invariants 1–5 apply. Most directly relevant: #4 (no item content
  in logs/audit — IDs/count/recipient-hash only) and #5 (user-scoped:
  digest only ever touches the calling user's own items). #1–#3
  (soft-delete/confirmation/audit-on-delete) aren't exercised by this
  slice but must not be weakened — satisfied for free by reusing
  `listItems`/`recordAuditEvent` instead of reimplementing.
- Approval scope is exactly `APPROVAL_RECORD-1.md`: build
  `sendItemsDigest(userId)` against a placeholder adapter that throws by
  default; real provider wiring is explicitly not approved.
- Reuse `savedItems.js`/`audit.js` as-is; don't duplicate their logic.
- Logs/audit metadata: IDs, counts, recipient-hash — never item content.

## Gate map — Tier 3

Per the slice plan's tier call and the stage sequence above, at release
this slice must clear:

- **QA gate** — full evidence (composition, throw-by-default, audit
  emission, user-scoping); not compressed.
- **Security & Privacy gate** — full; not compressed. Confirms invariant 4
  (no content leak into logs/audit) and that the adapter seam has no path
  to a real send in this build.
- **Release / human-approval verification gate** — Release Manager must
  verify `runs/email-digest/APPROVAL_RECORD-1.md` before the slice lands:
  decision is APPROVED, shipped scope matches it exactly (placeholder-only,
  throws by default), and rule-6 (real provider) remains un-triggered —
  stated explicitly in the record itself.
- **Post-Launch** — runs after landing; not a pre-release gate.

Exact gate checklist wording should be cross-checked by the Release
Manager against `docs/RELEASE_GATES.md` directly — that doc was outside
this Scope stage's restricted input set, so gates above are named from the
slice plan/approval record, not re-verified against it here.

## Success criteria (measurable)

1. Given a fixture set of a user's live items, the composition step of
   `sendItemsDigest` produces a correct, deterministic digest payload —
   unit-tested, independent of the adapter call.
2. `PlaceholderEmailAdapter` throws on every invocation, by default, with
   no configuration path that suppresses the throw in this build —
   unit-tested.
3. The send action emits exactly one audit event whose metadata contains
   only IDs/count/recipient-hash (asserted: no title/content field) —
   unit-tested.
4. A user can never compose or send a digest containing another user's
   items — unit-tested (cross-user case).
5. No regression: existing `test/savedItems.test.js` passes unmodified.

## Flag for the Orchestrator (out of scope for this slice)

`.agentic/CURRENT_MVP_STATUS.md` is stale: it lists "Bulk delete" as
**not yet built**, but `bulkDeleteItems` is already implemented and
shipped in `src/services/savedItems.js` (verified by reading the file).
Housekeeping gap in a different slice's Post-Launch update — flagging
rather than fixing here to avoid scope creep into an unrelated file.
