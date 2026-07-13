# Current MVP Status — Stash (seed)

## Shipped

- Saved-items store, scoped by `userId`.
- `addItem`, `listItems`.
- `softDeleteItem` — single-item soft delete (`deletedAt`), emits an
  `items.deleted` audit event, user-scoped.
- `bulkDeleteItems` — explicit-ID bulk soft delete, one
  `items.bulk_deleted` audit event (run-1, PR #1).
- `sendItemsDigest` + `PlaceholderEmailAdapter` (throws — no real sends;
  rule-6 provider approval not requested) — email-digest slice (run-2).
- Audit log (`recordAuditEvent`, `listAuditEvents`).
- Tests (`test/savedItems.test.js`, `test/digest.test.js`).

## Not yet built

- Real email provider wiring (needs rule-6 approval + preconditions
  P-1..P-6 in runs/email-digest/05-security-review.md).
- Restore / undo, trash view (future).

## Relevant code

- `src/services/savedItems.js`, `src/services/audit.js`.

## Constraints

- Reuse `softDeleteItem`'s soft-delete + audit logic; don't duplicate it.
- Bulk delete must be user-scoped and must emit audit coverage.
