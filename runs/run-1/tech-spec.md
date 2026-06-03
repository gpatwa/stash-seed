# Tech Spec — Bulk Delete Saved Items

> Owner: Software Architect Agent
> Status: ready for implementation
> Source: EM slice brief "Let a user select several saved items and delete them together"

## Summary

Add a `bulkDeleteItems(userId, itemIds)` function to `src/services/savedItems.js`
that soft-deletes an explicit, caller-supplied list of item IDs for a single user
in one call. The function iterates over the supplied IDs, delegates each deletion
to the existing `softDeleteItem`, and emits one summary audit event
(`items.bulk_deleted`) after all individual deletions succeed. No new data store,
no new file, and no new dependency is introduced. "Confirmation" is expressed
structurally: the API requires an explicit array of IDs and never accepts a broad
filter, satisfying SAFETY_INVARIANTS 1–5.

---

## Data model deltas

No schema changes. The existing in-memory `items` Map and the `deletedAt` field
already support soft-deletion of any number of records. The audit log's append-only
`events` array already supports multiple events per call.

| Type | Change | Rationale |
|------|--------|-----------|
| `items` Map entry | none | `deletedAt` field already exists; reused as-is |
| `audit` events array | none (new event type only) | append-only, no structural change needed |

---

## Service surface

| Function | Signature | Invariant |
|----------|-----------|-----------|
| `savedItems.js:bulkDeleteItems` | `(userId: string, itemIds: string[]) => { deleted: string[], skipped: string[] }` | Throws `TypeError` if `userId` is not a non-empty string. Throws `TypeError` if `itemIds` is not a non-empty array. Never deletes by filter — `itemIds` must be an explicit list. Items belonging to another user, already soft-deleted, or not found are silently placed in `skipped` (not thrown). Emits exactly one `items.bulk_deleted` audit event after processing, even if every ID was skipped. Returns counts-only metadata safe for callers to log. |

### Detailed behaviour

1. **Guard clauses (throw early, before any mutation):**
   - `userId` must be a non-empty string — throw `TypeError("userId required")`.
   - `itemIds` must be a non-empty array — throw `TypeError("itemIds must be a non-empty array")`.

2. **Iterate and delegate:**
   - For each `id` in `itemIds`, call `softDeleteItem(userId, id)`.
   - If it returns `true`, append `id` to `deleted`.
   - If it returns `false` (not found, wrong user, already deleted), append `id` to `skipped`.

3. **Emit one summary audit event** (after the loop, regardless of outcome):
   ```
   recordAuditEvent(userId, "items.bulk_deleted", {
     requestedCount: itemIds.length,
     deletedCount:   deleted.length,
     skippedCount:   skipped.length,
     deletedIds:     deleted,   // IDs only — no content
     skippedIds:     skipped,   // IDs only — no content
   });
   ```

4. **Return** `{ deleted, skipped }`.

### Why return `skipped` rather than throwing on partial failure

Partial-failure semantics that continue processing mirror what a user expects from
a batch UI action: "delete these 10, tell me if any couldn't be done." Throwing on
the first failure would leave the user uncertain about which items were processed.
The skipped list lets the caller surface a precise error message without the service
needing to know about the UI layer.

---

## Adapter boundaries

This slice contains no LLM calls, no external I/O, and no network requests.
All logic is deterministic. No adapter boundary table is needed.

---

## Audit / feedback / usage events

| Event type | Emitted from | Metadata fields |
|------------|--------------|-----------------|
| `items.deleted` (audit — existing) | `savedItems.js:softDeleteItem` | `itemId` — one event per successfully deleted item; already ships |
| `items.bulk_deleted` (audit — new) | `savedItems.js:bulkDeleteItems` | `requestedCount`, `deletedCount`, `skippedCount`, `deletedIds` (array of IDs), `skippedIds` (array of IDs) — **never item content** |

The existing per-item `items.deleted` events emitted by `softDeleteItem` are
retained. The new `items.bulk_deleted` event is a summary companion; both records
exist in the audit log, giving fine-grained traceability (individual `items.deleted`
entries) plus a single event that captures the batch intent.

---

## Integration points

- `savedItems.js:softDeleteItem` — delegated to for each item in the list.
  `bulkDeleteItems` owns the loop and the summary audit event; it does NOT
  re-implement soft-delete logic or call `recordAuditEvent` for individual items.
- `audit.js:recordAuditEvent` — called once by `bulkDeleteItems` to record the
  `items.bulk_deleted` summary event.

---

## Test plan

All tests go in `test/savedItems.test.js`, extending the existing suite.

### Cases to add

| # | Description | What is asserted |
|---|-------------|------------------|
| 1 | **Happy path — all IDs owned by user** | Returns `{ deleted: [id1, id2], skipped: [] }`. Both items have `deletedAt` set. `listItems` returns empty. Audit log contains two `items.deleted` events and one `items.bulk_deleted` event with correct counts. |
| 2 | **Partial match — mix of own and other-user IDs** | Own IDs appear in `deleted`; other-user IDs appear in `skipped`. Other user's items are untouched (`_getItem` shows `deletedAt === null`). |
| 3 | **Already-deleted ID in list** | ID is in `skipped`; no duplicate audit event for that ID; `deletedCount` is correct. |
| 4 | **All IDs unknown** | Returns `{ deleted: [], skipped: [ids...] }`. One `items.bulk_deleted` event is emitted with `deletedCount: 0`. |
| 5 | **Guard — empty array** | Throws `TypeError`. No mutation. No audit event emitted. |
| 6 | **Guard — missing userId** | Throws `TypeError`. No mutation. No audit event emitted. |
| 7 | **User isolation — cross-user call** | `bulkDeleteItems("u2", [idOwnedByU1])` returns `skipped: [id]`. `_getItem(id).deletedAt` is still `null`. |
| 8 | **Audit payload shape** | `items.bulk_deleted` event metadata contains `requestedCount`, `deletedCount`, `skippedCount`, `deletedIds`, `skippedIds` — and does NOT contain any `content` field. |
| 9 | **Single-item list** | Works correctly; regression guard to ensure `bulkDeleteItems` with `[id]` behaves the same as `softDeleteItem`. |

### Commands

```
node --test test/savedItems.test.js   # targeted
npm test                              # full suite
npm run qa:mvp                        # full QA gate before merge
```

---

## Rollback plan

This slice adds one exported function to an existing file and adds test cases.
No schema migration, no new file, no new dependency. Rollback is a one-step revert:

1. **Revert the commit** that adds `bulkDeleteItems` and its tests:
   ```
   git revert <commit-sha>
   git push origin main
   ```
   This removes the function from `savedItems.js` and the new test cases from
   `savedItems.test.js` in a single, reviewable commit. The existing
   `softDeleteItem` and all prior tests are unaffected.

2. **Verify:** Run `npm test` and `npm run qa:mvp` after the revert commit lands
   to confirm the baseline suite is green.

There is no data migration to reverse: the in-memory store is reset on process
restart, and `deletedAt` records written during the lifetime of the now-reverted
function are indistinguishable from single-item soft deletes — they remain
recoverable and do not need to be cleaned up.

---

## Risks / open questions

| Risk | Mitigation |
|------|------------|
| Caller passes thousands of IDs in one call, causing a slow synchronous loop | Accepted for the seed: in-memory Map lookups are O(1); this becomes relevant only at scale. If the store moves to a database, replace the loop with a single scoped `UPDATE … WHERE id IN (…) AND userId = ?` and emit the audit event from the service layer. Document at that time. |
| Caller omits one ID and wonders why it shows up in `skipped` | Clear return shape (`deleted` + `skipped`) lets the caller detect and surface this. No server-side mitigation needed for a headless API. |
| `items.deleted` events accumulate alongside `items.bulk_deleted`, making the audit log chatty for large batches | Accepted. Both event types serve different needs (per-item traceability vs. batch intent). If log volume becomes a concern, the summary event alone could be made the authoritative record, but that change requires explicit human approval per SAFETY_INVARIANTS §3. |

---

## Hand off

Next agent: **Backend Engineer**

Artefacts to produce:
- Add `bulkDeleteItems` to `src/services/savedItems.js` (no new file).
- Add the 9 test cases listed above to `test/savedItems.test.js`.
- One focused commit. Run `npm test` and `npm run qa:mvp` before committing.
- Do not modify `src/services/audit.js` — no changes needed there.
