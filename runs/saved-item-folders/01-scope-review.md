# Agent Handoff — Engineering Manager → Software Architect

> Slice: saved-item-folders
> From: Engineering Manager (Scope Review, stage 2)
> To: Software Architect (Architecture, stage 3)
> Date: 2026-09-06

## Decision

**APPROVED as one slice — no split required.** One boundary change added to
the plan's non-goals (HTTP surface excluded — see § Scope correction).
Proceed to Architecture.

## Artefact produced

- Scoped work item (this document): `runs/saved-item-folders/01-scope-review.md`

---

## Size check — against the EM scope-discipline rules

Sized against the real code, not the plan's description of it. Read for
sizing: `src/services/savedItems.js` (83 lines; `addItem`, `listItems`,
`softDeleteItem`, `bulkDeleteItems`, `_getItem`, `_reset`),
`src/services/audit.js` (30 lines), `src/server.js`,
`src/services/digest.js`, `src/services/summary.js`,
`scripts/build-check.mjs`, and the four test files.

Estimated footprint (filenames indicative — module split is the Architect's
call; the **count** is what this gate is about):

| File | Change |
|------|--------|
| `src/services/folders.js` | new — folder entity + create/list/delete + `_reset` |
| `src/services/savedItems.js` | modified — `folderId` on the item record, folder assignment, `listItems` folder filter |
| `test/folders.test.js` | new — create/list/delete, unfoldering on delete, user-scoping, audit shape |
| `test/savedItems.test.js` | modified — folder-filtered `listItems`, assignment, cross-user rejection |
| `scripts/build-check.mjs` | modified — one line: register the new module (it enumerates shipped modules explicitly) |

**~2 new files, ~3 modified, 5 total.** Half the 10-file cap.

Rule-by-rule:

- **>10 files, non-refactor** — no (5).
- **Mixes behaviour change with internal refactor** — no. Purely additive:
  no existing function's behaviour is being rewritten. `listItems` gains an
  *optional* filter; its existing one-argument call sites are untouched
  (see the hard constraint in § Constraints).
- **New dependency** — no. Dependency-free Node ESM holds.
- **>2 unrelated test suites to verify** — no. `npm test` runs the whole
  suite in one command (`node --test`), and the blast radius is
  `test/savedItems.test.js` + the new `test/folders.test.js`;
  `digest.test.js` / `summary.test.js` / `server.test.js` are regression
  checks, not new verification surface.
- **Observable success criteria** — yes; all six criteria below are
  assertable in `node:test` without a UI or a running server.

**One implementation pass. No split.**

---

## Scope correction the plan does not carry (EM's call)

The slice plan says the surface is "the service API" and that there is no UI
surface. That was true when the earlier `email-digest` slice ran; **it is no
longer the whole picture.** This repo now has an HTTP surface —
`src/server.js` (`GET /items`, `POST /items`, `POST /items/bulk-delete`,
`POST /digest`), `test/server.test.js`, and `scripts/smoke.mjs`.

**Decision: HTTP endpoints for folders are OUT of scope for this slice.**

Reasoning:

1. **Precedent in this repo.** `src/services/summary.js` shipped as a
   service with no HTTP endpoint — `server.js` imports `addItem`,
   `listItems`, `bulkDeleteItems`, `sendItemsDigest` and nothing else. A
   service landing without transport exposure is the established pattern
   here, not an omission.
2. **The transport surface was its own slice** (`runs/http-api/notes.md`),
   deliberately separated from the services it wraps.
3. **Cost.** Folder routes would add ~4 endpoints + validation + server
   tests + smoke coverage: roughly doubles the footprint and mixes a
   data-model decision with a transport decision in one pass — precisely
   what the "one implementation pass" gate exists to prevent.
4. **Risk.** That surface is unauthenticated by design (`userId` is a
   self-asserted header/param) and safe only because of invariant 7's
   loopback bind. Widening what it exposes is a decision that deserves its
   own slice's Security stage, not a rider on this one.

Recorded as a follow-up for the Orchestrator: *"Expose folders over the
HTTP API"* — a separate, later slice.

### But one HTTP-visible effect does land here — flag for Architect and QA

`server.js` returns `listItems(userId)` results **directly** as JSON. Adding
`folderId` to the item record therefore changes the `GET /items` response
body — every item gains a `folderId` field (`null` for unfoldered items),
without a line of `server.js` changing.

This makes the plan's success criterion *"existing behavior is unchanged"*
slightly too strong. Precise version: **existing behaviour is unchanged;
the item record shape is additively extended.** No existing test breaks —
verified: no test asserts a whole item object with `deepEqual`
(`test/server.test.js` and `test/savedItems.test.js` assert only
`deleted`/`skipped` arrays and status fields), and `digest.js` maps items to
`{itemId, content}` explicitly while `summary.js` reads `.content`. Both are
safe. QA should still assert this deliberately rather than inherit it.

Tier is unaffected: an additive read-only field on a loopback-only surface
is not an external effect.

---

## Stage / compression decision

**Confirms the plan's sequence as-is:** Scope → Architecture →
Implementation → QA → Security → Release → Post-Launch.

- **Market Research: skip.** Well-understood internal extension of existing
  list-hygiene work. Agreed with intake.
- **UX / UI Design: skip.** No view layer exists in `src/` at all. There is
  no stage here to compress — same call as `email-digest`.
- **Discovery / PM: not run.** The plan's success criteria are already
  observable (the Discovery gate's actual test), so the gate is satisfied
  without the stage. **One PM-owned assumption is recorded, not reopened:**
  "one folder per item, no nesting" is a product simplification the plan
  asserted rather than researched. EM does not own product, and this is
  consistent with the b2c-saas pack (low-friction, fast task completion), so
  it stands for v1 — but it belongs in Post-Launch as an assumption to
  validate, not as a mid-slice reopen. Architect: design so that
  single-membership is a *policy*, not a shape that forecloses a future
  many-to-many, but **do not build for many-to-many now.**
- **Architecture: FULL — independently agreed, not just inherited.** See
  below.
- **Implementation / QA / Security: full**, per Tier 2.

### Architecture must genuinely run — the EM's independent reasoning

The plan asserts this; I agree, and for reasons the plan only partly names:

1. **Module ownership is a real fork with no default.** Does the folder
   entity live in a new `folders.js`, or extend `savedItems.js`? Item↔folder
   assignment could sit on either side, and the wrong choice creates a
   circular import between the two modules. This repo has no precedent for
   two mutually-referencing service modules — every existing dependency is
   one-directional (`digest.js` → `savedItems.js`, `summary.js` →
   `savedItems.js`, `savedItems.js` → `audit.js`). **Import direction is an
   architecture decision, and it is load-bearing.**
2. **Record-shape change to a shipped entity with live downstream
   consumers** — `server.js`, `digest.js`, `summary.js`, `smoke.mjs`. The
   only prior slices were pure additions with zero shape impact. This one
   isn't.
3. **Referential integrity has no existing pattern here.** "Delete a folder,
   don't delete its items" is the first cascade-adjacent rule in this
   codebase. Whether unfoldering is eager (walk items, null the field) or
   lazy (dangling `folderId` resolved on read) is a genuine design decision
   with different failure modes and different audit shapes.
4. **`RELEASE_GATES.md` has an explicit Architecture gate** — *"Audit /
   feedback / usage events listed"* — that only the Architect can close.
   The plan left folder-event auditing as an open question; that is an
   Architecture answer (which events exist, what metadata), which Security
   then *verifies*. Compressing Architecture would push an unanswered
   design question into Implementation, where it gets decided by accident.
5. **Migration is not what the plan implies — and that itself needs
   stating.** The store is an in-memory `Map`, so there is no persistent
   data to migrate and no migration script. What actually exists is a
   **back-compat decision** on the record shape (`addItem` must default
   `folderId` to `null`, and pre-existing records must read as unfoldered
   rather than `undefined`). The Architect should record this explicitly so
   the Release Manager can mark the enterprise "schema/data migration"
   gate n/a for the right reason.

**Cap on the Architecture stage:** produce a decision record, not a redesign
of the store. In-memory `Map` stays. No persistence layer, no ORM, no
adapter, no repository abstraction. If the tech spec proposes any of those,
it has exceeded this slice and comes back to me.

---

## What "done" looks like for the next stage

The Architecture stage is done when the tech spec answers all of these,
each in a way an implementer can act on without returning to ask:

1. **Module boundary + import direction.** Where the folder entity lives,
   where item↔folder assignment lives, and which module imports which.
   State explicitly that there is no cycle.
2. **Record shapes.** The folder record; the added field on the item record;
   the default for items created before/without a folder. Name the exact
   field.
3. **Public function signatures**, including how `listItems` gains folder
   filtering **without breaking its existing single-argument call sites**
   (`digest.js:86`, `summary.js:132`, `server.js:55` all call
   `listItems(userId)`).
4. **Delete-folder semantics.** Eager vs lazy unfoldering, chosen with a
   one-line rationale, and what happens to items in a deleted folder.
5. **Audit event list** — closes the Architecture gate. For each of folder
   create / item assign / folder delete: does it emit an event, what type
   string, what metadata. Metadata may carry IDs, names and counts —
   **never item content** (invariant 4). Note explicitly whether a folder
   *name* is user-authored data that belongs in audit metadata; that is a
   judgement call, make it consciously rather than by default.
6. **User-scoping enforcement points.** Where invariant 5 is checked for
   each new operation, including the cross-user cases: assigning *my* item
   to *another user's* folder, and assigning *another user's* item to *my*
   folder. Both must be rejected, never silently succeed.
7. **Adapter boundaries** — gate item; expected answer here is "none / n/a,
   no new adapter", but state it rather than leaving the gate unanswered.
8. **Back-compat statement** for the `GET /items` response-shape change
   described above.
9. **Rollback note** for the Release Manager: revert the commit; no
   persistent state, therefore no data rollback. (Release Manager owns the
   final plan; the Architect supplies this input.)
10. **Test-isolation hook.** If a new module holds state, it needs a
    `_reset()` helper matching `savedItems.js` / `audit.js`, or the suite
    leaks state across test files.

---

## Minimal context

Only what the Architect needs. Not the whole repo.

- **Files to read:** `src/services/savedItems.js` (83 lines — read in full),
  `src/services/audit.js` (30 lines — read in full),
  `.agentic/SAFETY_INVARIANTS.md`, `runs/saved-item-folders/00-slice-plan.md`.
- **Skim only, for consumer impact:** `src/server.js` lines 52-56,
  `src/services/digest.js` line 86, `src/services/summary.js` line 132 —
  the three `listItems(userId)` call sites.
- **Do not read:** `runs/` history beyond this slice, `test/summary.test.js`,
  `scripts/`. Not needed to make these decisions.
- **Commands to run:** none — Architecture produces a spec, not code. (The
  Implementation stage runs `npm run typecheck`, `npm test`,
  `npm run build`, `npm run qa:mvp`.)
- **Existing patterns to reuse:**
  - `bulkDeleteItems` (`savedItems.js:44-72`) — the house shape: validate
    inputs with `TypeError` → do the work → emit **one** summary audit event.
  - `softDeleteItem` (`savedItems.js:27-33`) — the user-scoping shape:
    `if (!item || item.userId !== userId ...) return false`. Reject, never
    throw a leaky error, never touch another user's record.
  - `recordAuditEvent(userId, type, metadata)` (`audit.js`) — the only audit
    path. Do not invent a parallel one.
  - Event naming convention already in use: `items.deleted`,
    `items.bulk_deleted` (`<entity>.<past-tense-action>`, snake_case).

---

## Constraints inherited from prior stages

- **`listItems(userId)` must keep working with exactly one argument.**
  Three shipped modules call it that way. Folder filtering arrives as an
  optional second parameter or equivalent — never as a changed positional
  signature. This is a hard constraint, not a preference.
- **Safety invariants.** Most directly engaged:
  - **#5 (user-scoped)** — the primary risk in this slice. Folders introduce
    a second ID space, and therefore a new way to cross the user boundary.
  - **#4 (no item content in logs/audit)** — folder audit metadata carries
    IDs / names / counts only.
  - **#1 (deletes are soft and recoverable)** — must not be weakened. A
    folder delete must never destroy item content. Whether folder records
    themselves are soft- or hard-deleted is an Architect decision; if hard,
    justify why the invariant does not extend to the container.
  - **#3 (every delete is audited)** — folder deletion is a delete. Treat
    the invariant as engaged and argue explicitly if you conclude otherwise.
  - **#2, #6, #7** — not engaged by this slice, and must not be weakened.
    Nothing here touches bulk-delete confirmation, LLM adapters, or the
    listener bind.
- **Dependency-free Node ESM. No build tooling, no packages**
  (`PROJECT_CONTEXT.md`).
- **In-memory `Map` store stays.** No persistence work in this slice.
- **Teams / sharing / RBAC are out of scope repo-wide**
  (`PROJECT_CONTEXT.md`). A folder is private to one user, full stop.
- **Landing path:** branch + PR. `main` has branch protection requiring the
  "Release gates" CI check — no direct push.
- **Human approval:** the Intake scan found no rule tripped, and I
  re-walked `HUMAN_APPROVAL_RULES.md` independently and agree — nothing in
  rules 1-6 is engaged. The standard rule-3 deploy/release approval still
  applies at the Release stage as it always does.

---

## Gate map — Tier 2 (confirmed)

I independently confirm the Orchestrator's tier call. Per
`RELEASE_GATES.md`: behavioural change, new internal data model, no send /
submit / publish / deploy, no auth or permission change, no third-party
integration. Tier 2, not 3. With HTTP endpoints excluded (above), the change
is not even reachable off the service layer this slice.

| Gate | Owner | Status for this slice |
|------|-------|----------------------|
| Slice fits one implementation pass | EM | **PASS** — 5 files, one pass |
| Non-goals explicit | EM | **PASS** — § Out of scope below |
| Success criteria observable | PM gate, satisfied at Scope | **PASS** — all six unit-assertable |
| Adapter boundaries identified | Architect | open — expected "n/a", must be stated |
| Audit / usage events listed | Architect | **open — the load-bearing one** |
| Typecheck / targeted tests / full suite / build | Engineer | `npm run typecheck`, `npm test`, `npm run build` |
| One commit per task · no new lint warnings | Engineer | `git log` review · `git diff --check` |
| UI verified in preview | QA | **n/a** — no UI surface exists in this repo |
| Local regression command passes | QA | `npm run qa:mvp` |
| Safety invariants verified | QA | checklist vs `.agentic/SAFETY_INVARIANTS.md` — invariants 1, 3, 4, 5 engaged |
| No secrets in diff · no PII logged | Security | diff review + grep |
| Audit events cover state changes | Security | spec ↔ diff cross-check — **the folder-audit question lands here** |
| Placeholder adapter still throws | Security | re-run digest tests — regression check only, untouched by this slice |
| Human approval points satisfied | Release Mgr | none outstanding at Scope; standard release approval applies |
| Rollback plan exists | Release Mgr | revert the commit; in-memory store, so no data rollback |
| Release checklist filled | Release Mgr | `templates/RELEASE_CHECKLIST_TEMPLATE.md` |

**Enterprise / governance gates: n/a.** This repo runs the core seven roles
without the enterprise overlay, consistent with every prior run here. Per
`RELEASE_GATES.md`, each is marked n/a with its reason rather than silently
skipped — most notably *"Schema / data migration has a plan + rollback"*:
n/a because the store is an in-memory `Map`, so there is no schema and no
data to migrate. The Architect still records the record-shape back-compat
decision (§ Done, item 8) — that is the substance the gate would have
protected.

---

## Success criteria (measurable, inherited + tightened)

1. A user can create a named folder; it appears in that user's folder list
   and in no other user's — unit-tested, including the cross-user case.
2. A saved item can be assigned to at most one folder. Reassignment
   replaces, never accumulates — unit-tested.
3. `listItems` filters by folder, and `listItems(userId)` with one argument
   returns the same set it does today — both unit-tested. The second half
   is the regression guard for the three existing call sites.
4. Deleting a folder leaves its items intact and readable as unfoldered.
   No code path in this slice can set `deletedAt` or remove an item record
   — unit-tested by asserting item survival after folder deletion.
5. Every new operation is user-scoped: a user cannot create in, read, write
   to, or delete another user's folder, nor assign across the user boundary
   in either direction — unit-tested for each of the four cases.
6. Audit coverage matches whatever the Architect's event list specifies,
   with metadata carrying no item content — unit-tested against the spec,
   and cross-checked by Security.
7. No regression: `npm run qa:mvp` passes, and `test/digest.test.js`,
   `test/summary.test.js`, `test/server.test.js` pass **unmodified**. If any
   of the three needs editing, the record-shape change was larger than
   scoped — stop and escalate to me rather than editing them.

---

## Open questions for the next agent

- [ ] Does folder create / assign / delete emit audit events, and which
      metadata? — **Architect decides** (Architecture gate), Security
      verifies. Invariant 3 mandates auditing deletes; folder deletion is
      the clearest case. My steer, not a decision: audit all three, since
      every other state-changing operation in this codebase is audited and
      the asymmetry would be the surprising choice.
- [ ] Is a user-authored folder *name* safe in audit metadata under
      invariant 4, or is it user content? — **Architect proposes, Security
      confirms.** Invariant 4 names "item content" specifically, so this is
      a genuine boundary question rather than a settled one.
- [ ] Eager or lazy unfoldering on folder delete? — **Architect decides**,
      with a one-line rationale.
- [ ] New `folders.js` module, or extend `savedItems.js`? — **Architect
      decides.** Constraint from me: no circular import between service
      modules, and the file count stays within the table above.

---

## Out of scope reminder

Restating what this slice is explicitly **not** doing:

- **HTTP endpoints for folders** — EM's addition to the plan's non-goals;
  see § Scope correction. A separate, later slice.
- Nested folders / folder hierarchies.
- An item belonging to more than one folder.
- Sharing a folder with another user; anything teams / RBAC.
- Bulk folder operations (bulk-assign, bulk-move) — v1 is single-item
  assignment, matching how `softDeleteItem` preceded `bulkDeleteItems`.
- Any UI. None exists in this repo.
- Restore / undo / trash view — adjacent list-hygiene work, still "not yet
  built" per `CURRENT_MVP_STATUS.md`, and still not this slice.
- Persistence, migrations, or any storage layer beyond the in-memory `Map`.
- Refactoring `savedItems.js` while you are in there. Additive changes only
  — mixing a refactor into a behaviour change is a scope-rule violation and
  I will send it back.

---

## Escalation path

If the Architect gets stuck:

- **Scope pressure** — the design will not fit the file budget, or a
  question above cannot be answered without expanding the slice: escalate to
  **Engineering Manager (me)**. Do not silently widen scope; a split is
  cheaper than an overrun.
- **Product questions** — nesting, multi-folder membership, what a folder
  means to the user: **PM-owned.** Out of both our lanes. Record the
  assumption and hand it to Post-Launch; do not resolve it inside this slice.
- **Safety-invariant tension** — any design where an invariant appears to
  need weakening: **stop.** That is `HUMAN_APPROVAL_RULES` rule 4 and needs
  human approval *before* implementation begins, not a design workaround.
  Escalate to the Orchestrator for an approval request.
- **Release go / no-go** — **Release Manager.** Not mine, not yours.

---

## Flags for the Orchestrator (not this slice's job to fix)

1. **`.agentic/PROJECT_CONTEXT.md` is stale.** Its "Tech shape" section
   lists only `addItem`, `listItems`, `softDeleteItem` and claims
   "Tests use `node:test` under `test/`" as the whole picture. The repo has
   since gained `bulkDeleteItems`, `digest.js`, `summary.js`,
   `emailAdapter.js`, and a full HTTP server (`src/server.js`). "Current
   focus" still reads as if bulk delete were unbuilt. Flagging rather than
   editing — that file is outside this slice's write scope, and the same
   class of staleness was flagged by the `email-digest` EM about
   `CURRENT_MVP_STATUS.md` and apparently only partly fixed. **This is now
   a repeat finding: context-pack maintenance has no owning stage.** Worth
   assigning to Post-Launch as a standing task rather than re-flagging it
   every run.
2. **Follow-up slice to file:** expose folders over the HTTP API
   (`src/server.js`), once this slice lands.
