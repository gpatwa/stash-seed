# QA Evidence — email-digest

> Owner: QA Evidence Agent
> Status: ready for security
> Source diff: `09bd4c4982a6ebbe2cc17a32d6a8d7576520ad54` ("Implement email-digest composer, adapter boundary, and orchestration"), branch `slice/email-digest`, parent `60d7f2b`.

## Commands run

In order, independently re-run from repo root (`/Users/gopalpatwa/opt/stash-seed`), each invoked separately (not chained with `&&`) so no failure could hide behind another. Node `v25.6.0`.

| # | Step | Project command | Result | Notes / tail |
|---|------|-----------------|--------|-------|
| 1 | Typecheck | `npm run typecheck` | pass | `typecheck ok` (syntax-checks every file under `src/services/*.js`, which picks up both new modules) |
| 2 | Targeted tests | `node --test test/digest.test.js` | pass | `tests 15 / pass 15 / fail 0` |
| 3 | Full test suite | `npm test` | pass | `tests 27 / pass 27 / fail 0 / cancelled 0 / skipped 0` |
| 4 | Build | `npm run build` | pass | `build ok` (import-check of `savedItems.js`/`audit.js`; unchanged by design — see impl notes) |
| 5 | Local regression | `npm run qa:mvp` | pass | `typecheck ok` then `tests 27 / pass 27 / fail 0` |
| 6 | Whitespace / diff check | `git diff --check` (working tree) and `git show 09bd4c4 --check` | pass | both exit 0, no output — no trailing-whitespace/conflict-marker issues |

Full `npm test` tail (all 27 tests, run independently of the engineer's session):

```
✔ composeDigest: N live items → itemCount, ordered itemIds, content present, subject reflects count
✔ composeDigest: empty input → well-formed itemCount:0 payload, never throws, never null
✔ composeDigest: deterministic — same input array yields deep-equal payload
✔ PlaceholderEmailAdapter: send always rejects, message names the adapter, no argument resolves
✔ PlaceholderEmailAdapter: name is the stable boundary name
✔ sendItemsDigest: throw path — rejects via placeholder, network-free
✔ sendItemsDigest: throw path — exactly one attempted event, zero sent events
✔ sendItemsDigest: attempt metadata carries only itemIds/itemCount/recipientHash
✔ sendItemsDigest: recipientHash matches helper; raw recipient appears nowhere in the event
✔ sendItemsDigest: user scoping — attempt itemIds are u1's own only, never u2's
✔ sendItemsDigest: attempt event visible under u1's log, absent from u2's
✔ sendItemsDigest: zero live items → one itemCount:0 attempt event, then throws
✔ sendItemsDigest: guard — empty/null userId throws TypeError, no audit event, no adapter call
✔ sendItemsDigest: guard — empty/missing recipient throws TypeError, no audit event, no adapter call
✔ sendItemsDigest: injected resolving stub — resolves, exactly one digest_sent, clean metadata, no content leak
✔ add and list items are scoped by user
✔ soft delete removes from list, keeps recoverable, and audits
✔ cannot delete another user's item
✔ bulkDeleteItems: happy path — all IDs owned by user
✔ bulkDeleteItems: partial match — own IDs deleted, other-user IDs skipped
✔ bulkDeleteItems: already-deleted ID lands in skipped, no duplicate audit event
✔ bulkDeleteItems: all IDs unknown — returns empty deleted, one bulk event
✔ bulkDeleteItems: guard — empty array throws TypeError, no mutation, no audit
✔ bulkDeleteItems: guard — missing userId throws TypeError, no mutation, no audit
✔ bulkDeleteItems: user isolation — u2 cannot delete u1's item
✔ bulkDeleteItems: audit payload shape — contains counts/IDs, not content
✔ bulkDeleteItems: single-item list behaves like softDeleteItem
ℹ tests 27
ℹ pass 27
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

Matches the engineer's reported 27/27 (12 pre-existing `savedItems.test.js` + 15 new `digest.test.js`) exactly — independently reproduced, not just re-read from the impl notes.

## Diff check — file plan verification

Claim to verify: "3 new files, 0 modified" (architecture doc, file plan) scoped to `src/`/`test/`.

```
$ git show --name-status 09bd4c4
A   runs/email-digest/03-impl-notes.md
M   runs/email-digest/STATE.md
A   src/services/digest.js
A   src/services/emailAdapter.js
A   test/digest.test.js
```

- Under `src/` and `test/`: exactly **3 files, all Added (A), 0 Modified (M)** — `src/services/digest.js`, `src/services/emailAdapter.js`, `test/digest.test.js`. Confirmed.
- The one Modified file (`runs/email-digest/STATE.md`) and the extra Added file (`runs/email-digest/03-impl-notes.md`) are pipeline run-artefacts, not source or test files — consistent with the impl notes' own scoping ("`git diff --stat -- src/ test/ package.json` returned empty before commit"), which I independently reproduced (empty output).
- `package.json` diff is empty — no new dependency added.
- Parent commit (`60d7f2b`) has no digest-related files — confirms these are genuinely new, not renames.

**Verdict: file-plan claim confirmed exactly.**

## Runtime probe (independent, not the unit tests)

Per instructions, wrote a throwaway probe at `runs/email-digest/probe.mjs` that imports the real modules directly (`../../src/services/digest.js`, `../../src/services/emailAdapter.js`, `../../src/services/savedItems.js`, `../../src/services/audit.js`) and drives them with its own `node:assert/strict` checks — independent of `test/digest.test.js`. Ran with `node runs/email-digest/probe.mjs`, then **deleted** the file (confirmed gone; `git status` shows no trace, it was never staged/committed).

Verbatim output:

```
--- (a) default placeholder adapter — throw + audit shape ---
  PASS: throws "Email sending is not configured in this build (PlaceholderEmailAdapter)."; attempted=1 sent=0

--- (b) injected no-op stub adapter — differential (attempted AND sent) ---
  PASS: stub adapter resolves; attempted=1 sent=1 (vs 1/0 in section a — placeholder is what blocks the send)

--- (c) no item content or raw recipient in audit metadata (any event type) ---
  PASS: 3 events stringified: no "SECRET-CONTENT-XYZ", no "probe@example.com"; recipientHash 01daf2b30b24 present and well-formed

--- (d) cross-user isolation on the compose path ---
  PASS: u1 digest itemIds = [item_1, item_2] — excludes u2's [item_3, item_4]

--- (e) invariants 1-5 regression — single-delete + bulk-delete sanity ---
  PASS: single-delete: soft/retained/audited/scoped OK; bulk-delete: explicit-IDs/retained/audited/scoped OK — invariants 1,2,3,4,5 hold

=== PROBE SUMMARY: ALL PASS ===
```
Exit code: `0`.

### Probe result summary (a–e)

| Check | What it independently proved | Result |
|---|---|---|
| a | Default call (no adapter arg → constructs its own `PlaceholderEmailAdapter`) rejects with a message containing both "not configured in this build" and "PlaceholderEmailAdapter"; audit log then holds **exactly 1** `items.digest_send_attempted` and **0** `items.digest_sent`. | PASS |
| b | Same call shape, only the injected adapter changed to a local no-op stub (`{name, async send(){}}`) → call **resolves** (`{itemCount:1}`), audit log holds **1 attempted AND 1 sent**. The only variable between (a) and (b) is the adapter — proves the placeholder itself, not some other code path, is what blocks `items.digest_sent`. | PASS |
| c | Seeded an item with content `"SECRET-CONTENT-XYZ"` and used recipient `"probe@example.com"`; generated both event types (attempted via placeholder, attempted+sent via stub, same secret/recipient); `JSON.stringify()` of **all** resulting audit events contains neither substring; `recipientHash("probe@example.com")` = `01daf2b30b24` — matches `/^[0-9a-f]{12}$/ ` (12 lowercase hex chars) — and that hash value **does** appear in the events (for correlation) on every event's `metadata.recipientHash`. | PASS |
| d | With `u1` holding 2 items and `u2` holding 2 different items, `sendItemsDigest("u1", ...)`'s attempt-event `itemIds` equal exactly `{u1's two ids}` and contain neither of `u2`'s ids; `u2`'s own audit log has 0 digest-attempt events. | PASS |
| e | Regression sanity across invariants 1–5: single soft-delete retains the record (`deletedAt` set, still fetchable via `_getItem`, absent from `listItems`) and audits with `{itemId}`-only metadata; cross-user single-delete attempt returns `false` and leaves the other user's item untouched; bulk-delete rejects `[]`/`undefined` with `TypeError` (no broad-filter delete path exists); a mixed-ownership bulk-delete deletes only the owned ids, skips the foreign id, retains all records, and audits once with count/id metadata only (no content). | PASS |

## Safety invariant verification

| Invariant (`.agentic/SAFETY_INVARIANTS.md`) | Verification | Result |
|-----------|--------------|--------|
| 1. Deletes are soft and recoverable | This slice adds no delete path (`grep -n "delete\|Delete" src/services/digest.js` matches only comments describing `listItems`' pre-existing `deletedAt` filter — no delete call in the new code). Regression re-confirmed via probe (e): `softDeleteItem`/`bulkDeleteItems` still set `deletedAt` and retain the record (`src/services/savedItems.js:30`, `:56`); unmodified `test/savedItems.test.js` (12/12) and `bulkDeleteItems` tests (9/9) all still green. | pass |
| 2. Destructive multi-item actions are confirmed (explicit ID list, never a broad filter) | Not touched by this slice (`sendItemsDigest` performs no deletion). `bulkDeleteItems` still guards `!Array.isArray(itemIds) \|\| itemIds.length === 0` (`src/services/savedItems.js:48-50`); probe (e) re-confirms `TypeError` on `[]` and `undefined`. | pass |
| 3. Every send-like/delete action is audited | New code: `recordAuditEvent(userId, "items.digest_send_attempted", ...)` fires **before** `adapter.send()` (`src/services/digest.js:93-97`, ordering matches architecture Decision 1) — so the attempt is auditable even though the placeholder always throws. Verified at runtime by probe (a): exactly 1 attempted / 0 sent on the throw path, and by test T-S2/T-S7. Existing delete auditing unchanged (probe e). | pass |
| 4. No item content in logs/audit metadata | `recordAuditEvent` calls in `digest.js` pass only `{itemIds, itemCount, recipientHash}` (`src/services/digest.js:93-97`, `:107-111`) — no `content`/`title`/`subject`/`body`/`recipient` key. Independently verified at runtime by probe (c): `JSON.stringify()` of every audit event generated (both types) does not contain a seeded distinctive content string or the raw recipient string; only the 12-hex-char `recipientHash` (one-way, `src/services/digest.js:53-55`, `node:crypto` `sha256`) appears. Matches tests T-S3/T-S4/T-S10. | pass |
| 5. A user only ever affects their own items | `sendItemsDigest` calls `listItems(userId)` (`src/services/digest.js:86`, reused unmodified, already user-scoped) and `recordAuditEvent(userId, ...)` (same `userId`) — no cross-user read path exists in the new code; `composeDigest` itself takes no `userId` parameter at all (confirmed by `grep -n "userId" src/services/digest.js` — the only `userId` occurrences are in `sendItemsDigest`'s own signature/guard/calls), so it cannot re-scope or leak across users. Independently verified at runtime by probe (d): `u1`'s digest `itemIds` are exactly `u1`'s two items, excluding both of `u2`'s; `u2`'s audit log shows zero digest-attempt events. Matches tests T-S5/T-S6. | pass |

**Boundary integrity (adapter, relevant to invariant-adjacent risk of a fake/real send):** `grep -rn "Adapter" src/` returns only `PlaceholderEmailAdapter` construction/reference (`src/services/emailAdapter.js:8,19,25`; `src/services/digest.js:7,66,77,105`) — no resolving adapter is constructed anywhere under `src/`. The only resolving adapter in the repo is the local test-file stub (`test/digest.test.js`, used by T-S10 and the probe), never imported by `src/`. Reproduced independently, matches impl notes claim exactly.

## UI verification

Not applicable. This slice is backend-only: `sendItemsDigest`/`composeDigest`/`PlaceholderEmailAdapter` are new exports with no route, no UI, no cron — nothing invokes them automatically (architecture doc, "Rollback plan": *"There is no ambient exposure for a flag to gate"*). No UX spec states exist to screenshot or snapshot. Confirmed no UI/route files touched: diff is limited to `src/services/*.js` and `test/*.js`.

Console errors / warnings observed: none (no `console.*` calls added — confirmed by inspection of both new `src/` files; no warnings emitted by any of the 6 command runs above).

## Deferred / skipped

| Item | Why deferred | Owner |
|------|--------------|-------|
| Real email-provider wiring (resolving adapter, env/config) | Out of scope — approval scope is limited to the placeholder-only boundary (`APPROVAL_RECORD-1.md`); a real send is explicitly a separate rule-6 request per the architecture doc. | Future slice / human approval |
| Unsalted `recipientHash` (SHA-256 of a low-entropy email string, truncated to 12 hex chars) | Accepted risk documented in architecture doc Decision 2 — no real recipients flow in this build; primary control is invariant 4 (raw address never stored at all). Salting is noted as hardening for the rule-6 slice when real addresses are introduced. Flagging forward to Security & Privacy to confirm they concur with this being an accepted (not blocking) risk. | Security & Privacy / rule-6 slice |
| "Success" path (`items.digest_sent`, resolve branch of `sendItemsDigest`) is unreachable in this build | By design — exercised only via the test-file/probe no-op stub, never constructed in `src/`. Not a gap: it's dead-for-now code guarded by the throwing placeholder, verified via the differential in probe (b)/T-S10. | Security & Privacy (boundary-integrity re-check), future rule-6 slice |

No test failures, no flaky tests, nothing blocked on missing input.

## Recommendation

- [x] **Pass to Security & Privacy Agent**
- [ ] Block — return to engineer

All 6 independent command runs pass (typecheck, targeted tests, full suite, build, local regression, whitespace/diff check). File plan independently confirmed as exactly 3 new files / 0 modified under `src/`/`test/`. A from-scratch runtime probe (not the engineer's tests), covering the default-throw path, the differential resolving-stub path, content/recipient leak-freedom across all audit events, cross-user isolation, and an invariants-1–5 regression sanity check, passed every assertion. All 5 safety invariants verified with citations (code line and/or independently-run test/probe). No deviations from spec found; three items noted above are legitimate deferrals already scoped out by the architecture doc's approval boundary, not gaps QA is silently smoothing over.

## Hand off

Next agent: Security & Privacy Agent.
