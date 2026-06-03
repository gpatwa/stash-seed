# Implementation Notes — Bulk Delete Slice

> Agent: Backend Engineer
> Branch: slice/bulk-delete
> Commit: 1cd7f76

## What changed

### `src/services/savedItems.js`
- Added exported function `bulkDeleteItems(userId, itemIds)`.
- Guard clauses throw `TypeError` before any mutation: empty/non-string `userId` and non-array/empty `itemIds`.
- Inner loop delegates each ID to the pre-existing `softDeleteItem`; no soft-delete or per-item audit logic is duplicated.
- One `items.bulk_deleted` audit event is emitted after the loop via `recordAuditEvent`, carrying `requestedCount`, `deletedCount`, `skippedCount`, `deletedIds`, `skippedIds` — no item content.
- Returns `{ deleted, skipped }`.

### `test/savedItems.test.js`
- Added import of `bulkDeleteItems` from the service module.
- Added 9 new test cases (cases 1–9 from the tech spec test plan).

No other files were modified. `src/services/audit.js` was read for context but not changed, as the spec requires.

## Commands run and results

| Command | Result |
|---------|--------|
| `git checkout -b slice/bulk-delete` | Branch created |
| `npm run typecheck` | `typecheck ok` |
| `node --test test/savedItems.test.js` (targeted) | 12 pass, 0 fail |
| `npm test` (full suite) | 12 pass, 0 fail |
| `npm run build` | `build ok` |
| `npm run qa:mvp` | typecheck ok + 12 pass, 0 fail |
| `git commit` | SHA `1cd7f76` |

## Safety invariants — verified by tests

| Invariant | Test case(s) |
|-----------|-------------|
| 1. Soft delete only — `deletedAt` set, record retained | Case 1 (`_getItem(id).deletedAt !== null`) |
| 2. Explicit ID list required (no broad filter) | Cases 5, 6 (guard clauses enforce non-empty array) |
| 3. Every delete audited — one `items.bulk_deleted` per call | Cases 1–4, 9 |
| 4. No item content in logs | Case 8 (asserts `!("content" in meta)`) |
| 5. User scoping — another user's IDs silently skipped | Cases 2, 7 |

## Spot-checks for QA

1. **Cross-user isolation**: call `bulkDeleteItems("u2", [idOwnedByU1])` and confirm `_getItem(idOwnedByU1).deletedAt` remains `null` and `u1`'s audit log is empty.
2. **Audit log count on a mixed batch**: with 3 own IDs + 1 other-user ID, the audit log should show exactly 3 `items.deleted` events and exactly 1 `items.bulk_deleted` event (not 4 + 1).
3. **Guard clauses leave no side effects**: pass an empty array or empty string userId and confirm zero audit events and zero `deletedAt` timestamps are set on any item.
