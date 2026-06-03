# Security & Privacy Review — Bulk Delete Slice

> Reviewer: Security & Privacy Agent
> Date: 2026-06-02
> Branch: `slice/bulk-delete` (commit `1cd7f76`)
> Diff files: `src/services/savedItems.js`, `test/savedItems.test.js`
> QA evidence: `runs/run-1/qa-evidence.md`

---

## Scope

This review covers only the diff between `main` and `slice/bulk-delete`. Two files
changed: the service layer (`savedItems.js`, one new exported function appended) and
the test suite (`savedItems.test.js`, nine new test cases added). No existing code was
modified.

---

## Findings

### Secrets / Credentials

No tokens, API keys, passwords, JWTs, bearer strings, `.env` files, or credential
files appear anywhere in the diff. Grep over the diff for the patterns `password`,
`secret`, `token`, `key`, `api_key`, `credential`, `jwt`, `bearer`, `auth`, `env`,
and `.env` yielded only two hits — both are test-fixture item content strings passed
to `addItem()` in Case 8 (`"secret content"`, `"more secrets"`). These strings are
inserted into the in-memory store as item payloads for the purpose of verifying that
the audit event does NOT contain them. They are not credentials and are not written
to any log or audit event in the implementation path.

**Result: CLEAR — no credentials or secrets in the diff.**

### PII / Item Content in Logs or Audit Metadata

The implementation's single `recordAuditEvent` call (line 37 of the hunk, positioned
unconditionally after the processing loop) passes exactly:

```
requestedCount, deletedCount, skippedCount, deletedIds, skippedIds
```

No `content`, `title`, `body`, or other item-data field is present. The
`deletedIds`/`skippedIds` fields carry string IDs only, consistent with invariant 4.
No `console.log`, `logger.*`, or any other log call appears anywhere in the diff.

The test Case 8 explicitly asserts that `content` is absent from the audit metadata
and that the literal string `"SUPER SECRET CONTENT"` does not appear in the
serialised event (confirmed by both the test suite and the independent runtime check
in QA evidence).

**Result: CLEAR — invariant 4 satisfied; no item content or PII in logs or audit.**

### Approval Bypass

Assessment against HUMAN_APPROVAL_RULES §1 and §2:

- **Rule 1 (send/submit on behalf of a user):** Not applicable. This slice adds no
  send, submit, publish, payment, email, or external-effect path. Confirmed: tech
  spec explicitly states "no LLM calls, no external I/O, and no network requests."
- **Rule 2 (destructive operations on shared state):** The `bulkDeleteItems` function
  is a *soft* delete — it sets `deletedAt` and retains records (invariant 1). The
  agent does not autonomously decide which items to delete; the function requires the
  caller to supply an explicit, non-empty array of IDs. No broad-filter path (`deleteAll`,
  `deleteByFilter`, `WHERE` clause, etc.) exists anywhere in the diff. The guard clause
  throws `TypeError` if `itemIds` is empty, making it structurally impossible to delete
  without an explicit list.

Rule 2 concerns an *agent* autonomously destroying *shared* state. This function
requires a user-initiated explicit ID list and operates only on the calling user's own
items. The soft-delete semantics mean nothing is irrecoverably destroyed. Rule 2 does
not apply at this level; human approval for the feature as a whole is a Release Manager
determination.

**Result: CLEAR — no approval bypass introduced.**

### Audit Coverage

Cross-check against the tech spec's event table:

| Event type | Spec requires | Diff implements | Status |
|------------|--------------|-----------------|--------|
| `items.deleted` (existing, per-item) | Retained; emitted by `softDeleteItem` | `bulkDeleteItems` delegates to `softDeleteItem` per item; no removal of this event | RETAINED |
| `items.bulk_deleted` (new, summary) | One event after the loop, regardless of outcome; metadata: `requestedCount`, `deletedCount`, `skippedCount`, `deletedIds`, `skippedIds`; never content | `recordAuditEvent` called unconditionally at line 37 of hunk, after the loop, with exactly the specified fields | IMPLEMENTED |

No audit event was removed, weakened, or made conditional. The call is outside any
`if`/`else` branch — it fires whether all IDs were deleted, all were skipped, or any
mix.

QA evidence independently confirmed: a call where all IDs are unknown still emits one
`items.bulk_deleted` event with `deletedCount: 0`.

**Result: CLEAR — full audit coverage; no event removed or weakened.**

### User-Scoping / Cross-User Isolation

`bulkDeleteItems` delegates each deletion to `softDeleteItem`, which guards at
`savedItems.js:29` with `item.userId !== userId`. Items owned by a different user are
returned as `false` by `softDeleteItem` and placed in `skipped` by `bulkDeleteItems`.
They are never soft-deleted and never appear in the caller's deleted list.

The audit event is scoped to the calling `userId` — another user's audit scope
receives no events from a cross-user bulk call. This was verified by:
- Unit tests Cases 2 and 7 (cross-user IDs skipped).
- Spot-check 1 and the u3 invariant-5 block in the runtime script (35 checks, 35 passed).

There is no path in the diff by which user A's IDs can be passed and have user B's
items soft-deleted.

**Result: CLEAR — invariant 5 satisfied.**

### Adapter Boundary Integrity (Rule 5)

Tech spec states explicitly: "This slice contains no LLM calls, no external I/O, and
no network requests." The diff confirms this. No import of any external package was
added (the only new import in the test file is `bulkDeleteItems` from the local
`savedItems.js`). No `fetch`, `axios`, `http`, `https`, or third-party module reference
appears in the diff.

**Result: CLEAR — no placeholder adapter touched; rule 5 N/A for this slice.**

---

## Per-Invariant Confirmation

| Invariant | Holds? | Evidence |
|-----------|--------|---------|
| **1. Deletes are soft and recoverable.** | YES | `bulkDeleteItems` delegates to `softDeleteItem` which sets `deletedAt`; no `items.delete()` call in the diff. QA runtime confirmed records remain in the store post-deletion. |
| **2. Destructive multi-item actions confirmed via explicit ID list.** | YES | Guard clause throws `TypeError` on empty array or missing `userId` before any mutation. No broad-filter path exists. Structurally impossible to call without supplying an explicit list. |
| **3. Every delete is audited.** | YES | `recordAuditEvent` called unconditionally after the loop. Per-item `items.deleted` events are retained via `softDeleteItem` delegation. All-skipped batch still emits one `items.bulk_deleted` event. |
| **4. No item content in logs or audit metadata.** | YES | Audit metadata contains only counts and IDs. No log calls in the diff. Test Case 8 and the runtime script explicitly verify content fields are absent. |
| **5. A user only ever affects their own items.** | YES | Cross-user IDs are skipped (not deleted), verified by unit tests Cases 2/7, spot-check 1, and the u3 invariant-5 runtime block. Audit scope is also scoped to the calling user. |

---

## Advisory Items

### A1 (advisory) — No upper bound on `itemIds.length`

The function accepts an unbounded array. A caller supplying 10,000 IDs triggers 10,000
sequential in-memory map lookups plus 10,000 `items.deleted` audit events in a single
synchronous call. This is not a security defect (it does not leak data or bypass a
gate), but it could be abused as a denial-of-service vector or exhaust memory in the
audit log at scale.

This was flagged as deferred in both the tech spec (risks table) and the QA evidence.
Recommended follow-on: add a `MAX_BULK_IDS` constant (e.g. 500) and throw if exceeded.
This requires no new approval gate — it is a hardening measure.

**Severity: advisory.** Not a blocker for this slice.

---

## Recommendation

**PASS — forward to Release Manager.**

All five safety invariants hold. No secrets, PII, approval bypass, or audit gap was
found in the diff. Adapter boundary is unchanged. The one deferred item (batch size
cap) is a future-slice hardening concern, not a defect.

---

## Release Tier Assessment

**Tier 2 — Behavioural change with no external effect.**

Rationale: this slice adds a new service-layer function that changes observable
behaviour (bulk soft-delete with audit) but produces no external effect — no network
call, no third-party integration, no deploy, no auth change, no LLM invocation. All
Tier 2 gates apply (implementation, QA, security, release checklist, rollback plan).
The rollback plan is present in the tech spec (single `git revert`).

Tier 3 gates do not apply: no send/submit/publish/deploy path was added.
