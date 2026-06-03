# Current MVP Status — Stash (seed)

## Shipped

- Saved-items store, scoped by `userId`.
- `addItem`, `listItems`.
- `softDeleteItem` — single-item soft delete (`deletedAt`), emits an
  `items.deleted` audit event, user-scoped.
- Audit log (`recordAuditEvent`, `listAuditEvents`).
- Tests for the above (`test/savedItems.test.js`).

## Not yet built

- **Bulk delete** ← this slice.
- Restore / undo, trash view (future).

## Relevant code

- `src/services/savedItems.js`, `src/services/audit.js`.

## Constraints

- Reuse `softDeleteItem`'s soft-delete + audit logic; don't duplicate it.
- Bulk delete must be user-scoped and must emit audit coverage.
