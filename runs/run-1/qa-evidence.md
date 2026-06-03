# QA Evidence — Bulk Delete Slice

> Owner: QA Evidence Agent
> Status: ready for security
> Source diff: commit `1cd7f76` on branch `slice/bulk-delete`
> QA run date: 2026-06-02

## Commands run

All commands executed independently from the repo root
after `git checkout slice/bulk-delete`. Each step run separately so failures
do not mask one another.

| # | Step | Project command | Result | Output tail |
|---|------|-----------------|--------|-------------|
| 1 | Typecheck | `npm run typecheck` | **pass** | `typecheck ok` |
| 2 | Full test suite | `npm test` | **pass** | `tests 12  pass 12  fail 0  duration_ms 80` |
| 3 | Build | `npm run build` | **pass** | `build ok` |
| 4 | Local regression | `npm run qa:mvp` | **pass** | `typecheck ok` + `tests 12  pass 12  fail 0  duration_ms 79` |
| 5 | Whitespace check | `git diff --check main..slice/bulk-delete` | **pass** | (no output — clean) |

### Full `npm test` output (step 2)

```
✔ add and list items are scoped by user (0.682ms)
✔ soft delete removes from list, keeps recoverable, and audits (0.729ms)
✔ cannot delete another user's item (0.047ms)
✔ bulkDeleteItems: happy path — all IDs owned by user (0.666ms)
✔ bulkDeleteItems: partial match — own IDs deleted, other-user IDs skipped (0.068ms)
✔ bulkDeleteItems: already-deleted ID lands in skipped, no duplicate audit event (0.070ms)
✔ bulkDeleteItems: all IDs unknown — returns empty deleted, one bulk event (0.059ms)
✔ bulkDeleteItems: guard — empty array throws TypeError, no mutation, no audit (0.156ms)
✔ bulkDeleteItems: guard — missing userId throws TypeError, no mutation, no audit (0.077ms)
✔ bulkDeleteItems: user isolation — u2 cannot delete u1's item (0.098ms)
✔ bulkDeleteItems: audit payload shape — contains counts/IDs, not content (0.072ms)
✔ bulkDeleteItems: single-item list behaves like softDeleteItem (0.070ms)
ℹ tests 12  pass 12  fail 0  cancelled 0  skipped 0  todo 0
```

## UI verification

This slice is a headless service layer (no UI). No browser preview
required. The spec and implementation are both back-end only.

| Screen | State | Evidence |
|--------|-------|----------|
| N/A — no UI changes in this slice | — | — |

Console errors / warnings observed: none (no runtime console output
during any of the above commands).

## Independent runtime verification

A throwaway script (`runs/run-1/qa-runtime-check.mjs`) was written,
executed with `node`, and then deleted. It imported `bulkDeleteItems`
directly and exercised all 5 invariants plus the 3 engineer spot-checks
without relying on the test runner.

**Result: 35 checks, 35 passed, 0 failed.**

Full script output:

```
=== INVARIANT 1: Soft delete — deletedAt set, record retained ===
  PASS  item i1a record exists in store (not hard-removed)
  PASS  item i1a deletedAt is a non-null string
  PASS  item i1b record exists in store
  PASS  item i1b deletedAt is set
  PASS  listItems returns 0 live items (soft-hidden)

=== INVARIANT 2: Explicit ID list required — no broad filter ===
  PASS  empty array throws TypeError (no broad filter possible)
  PASS  non-array throws TypeError
  PASS  empty userId throws TypeError

=== INVARIANT 3: Every bulk delete emits an audit event ===
  PASS  3 individual items.deleted events emitted (one per own item)
  PASS  exactly 1 items.bulk_deleted event emitted
  PASS  bulk event requestedCount = 4
  PASS  bulk event deletedCount = 3
  PASS  bulk event skippedCount = 1
  PASS  u2 audit scope has 0 events from the u1 bulk call

=== INVARIANT 4: No item content in audit metadata ===
  PASS  bulk audit event exists
  PASS  'content' key absent from bulk metadata
  PASS  'SUPER SECRET CONTENT' string not in serialised event
  PASS  items.deleted metadata has 'itemId' key
  PASS  items.deleted metadata does NOT have 'content' key

=== INVARIANT 5: Cross-user isolation — foreign items untouched ===
  PASS  u3 bulk delete skips all foreign IDs
  PASS  u3 bulk delete deletes nothing
  PASS  u1 item deletedAt is null after u3 bulk call
  PASS  u2 item-a deletedAt is null after u3 bulk call
  PASS  u2 item-b deletedAt is null after u3 bulk call
  PASS  u3 audit scope gets the bulk event
  PASS  u3 bulk event skippedIds lists the 3 foreign IDs
  PASS  u1 audit scope is empty after u3 bulk call
  PASS  u2 audit scope is empty after u3 bulk call

=== SPOT-CHECK 1: cross-user call, u2 calls with u1 ID ===
  PASS  sc1: foreign item deletedAt is null
  PASS  sc1: u1 audit scope has no events from u2 bulk call
  PASS  sc1: returned skipped contains the foreign id

=== SPOT-CHECK 2: mixed 3 own + 1 foreign, audit counts ===
  PASS  sc2: exactly 3 items.deleted events
  PASS  sc2: exactly 1 items.bulk_deleted event

=== SPOT-CHECK 3: guard clauses leave no side effects ===
  PASS  sc3: item deletedAt still null after guard-throw calls
  PASS  sc3: zero audit events after guard-throw calls

────────────────────────────────────────────────────────────
RESULT: 35 passed, 0 failed
ALL CHECKS PASSED — safe to include in QA evidence.
```

## Safety invariant verification

| Invariant | How verified | Result |
|-----------|--------------|--------|
| **1. Deletes are soft and recoverable.** `deletedAt` set; record retained, never removed. | Unit tests: Case 1 (`_getItem(id).deletedAt !== null`). Runtime script: confirms record still in map after bulk call, `listItems` hides it, `_getItem` still returns it. Code inspection: `softDeleteItem` at `savedItems.js:30` sets `item.deletedAt = new Date().toISOString()` — no `items.delete()` call anywhere. | **pass** |
| **2. Destructive multi-item actions are confirmed.** Explicit ID list required; no broad filter. | Unit tests: Cases 5 & 6 (guard clauses throw `TypeError`). Runtime script: 3 separate guard checks (`[]`, non-array, empty `userId`). Code inspection: `savedItems.js:44-50` — two guard `throw` blocks before any loop. | **pass** |
| **3. Every delete is audited.** Each deletion (single or bulk) emits an append-only audit event. | Unit tests: Cases 1–4, 9 assert `items.bulk_deleted` event present. Runtime script: confirmed 3 `items.deleted` + 1 `items.bulk_deleted` on a 4-item mixed batch; all-unknown batch still emits 1 bulk event. Code inspection: `recordAuditEvent` called unconditionally at `savedItems.js:63` after the loop. | **pass** |
| **4. No item content in logs.** Audit metadata carries IDs/counts, never saved content. | Unit tests: Case 8 asserts `!("content" in meta)`. Runtime script: added `"SUPER SECRET CONTENT"` item, confirmed the string absent from `JSON.stringify(bulkEvent)`, `content` key absent from both `items.deleted` and `items.bulk_deleted` metadata. Code inspection: `recordAuditEvent` call at `savedItems.js:63-69` only passes `requestedCount`, `deletedCount`, `skippedCount`, `deletedIds`, `skippedIds`. | **pass** |
| **5. A user only ever affects their own items.** Every operation scoped by `userId`; another user's IDs rejected/skipped. | Unit tests: Cases 2 & 7. Runtime script: u3 calls bulk delete with u1+u2 IDs — all 3 land in `skipped`, all `deletedAt` remain `null`, u1 and u2 audit scopes are empty. Engineer spot-check #1 confirmed. Code path: `bulkDeleteItems` delegates to `softDeleteItem` which guards with `item.userId !== userId` at `savedItems.js:29`. | **pass** |

## Diff summary

Only two files changed from `main`:

- `src/services/savedItems.js` — added `bulkDeleteItems` (lines 44–72).
  No existing function modified.
- `test/savedItems.test.js` — added 9 new test cases and import of
  `bulkDeleteItems`. No existing test modified.

`src/services/audit.js` unchanged (verified by diff — no hunk for that
file).

## Deferred / skipped

| Item | Why deferred | Owner |
|------|--------------|-------|
| Persistence / database-layer audit durability | Seed uses in-memory store by design; persistence is out of scope for this slice per the tech spec. | Future slice |
| Rate-limiting / batch size cap | No upper bound on `itemIds.length`. Not in scope for this slice (spec is silent). Should be considered before production. | Engineer / PM |
| Concurrent call safety | In-memory store; no locking. Out of scope for in-memory seed. | Future slice |

## Recommendation

- [x] **Pass to Security & Privacy Agent**
- [ ] Block — return to engineer

All 5 safety invariants hold. The full regression suite (12 tests) passes
cleanly. Independent runtime verification (35 checks) confirms invariants
at the call level, not just via the test harness. No regressions detected
in the 3 pre-existing tests. Two deferred items noted — neither is a
blocking defect for this slice.

## Hand off

Next agent: Security & Privacy Agent.
Artefacts: this file (`runs/run-1/qa-evidence.md`), branch
`slice/bulk-delete`, commit `1cd7f76`.
