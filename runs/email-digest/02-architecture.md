# Tech Spec — email-digest

> Stage 3 · Owner: Software Architect
> Status: ready for implementation
> Source: `runs/email-digest/01-em-scope.md` (+ `00-slice-plan.md`, `APPROVAL_RECORD-1.md`)
> Model: opus (Tier-3 slice, per `.claude/protocols/MODEL_ROUTING.md`)

## Summary

Add the ability to compose an email digest of a user's live saved items and
"send" it through an adapter seam that, in this build, **only ever throws**.
The slice is a pure addition: a stateless `EmailAdapter` boundary with a
throwing `PlaceholderEmailAdapter`, a **pure** `composeDigest(items)`
function, and an orchestration function `sendItemsDigest(userId, recipient)`
that reuses `listItems`/`recordAuditEvent` unchanged. No real provider is
wired (approval scope: `APPROVAL_RECORD-1.md`; a real send returns as a
separate rule-6 request). Everything is deterministic and runs with zero
network.

This is **one implementation pass** — interface + composer + sender + tests.
There is no phase-2 split. The future real-provider wiring is a *separate
slice*, not a deferred half of this one.

## Data model deltas

| Type | Change | Rationale |
|------|--------|-----------|
| `SavedItem` | none | Reused read-only via `listItems`. |
| Audit log | new **event type strings** only (additive) | Two new `type` values on the existing append-only log; no schema/shape change. |

No persisted schema change. The seed's audit log is an in-memory,
append-only array (`src/services/audit.js`); this slice only introduces two
new `type` string values written through the existing `recordAuditEvent`.
No new store, no migration, no index.

### Digest payload shape (transient, never persisted)

`composeDigest` returns a plain object handed to the adapter and then
discarded. It is **not** stored and **not** logged.

```js
/**
 * @typedef {Object} DigestPayload
 * @property {number}   itemCount               // === items.length
 * @property {string[]} itemIds                 // input order, one per item
 * @property {{itemId:string, content:string}[]} items   // input order
 * @property {string}   subject                 // deterministic, count-based
 * @property {string}   body                    // deterministic plain-text render
 */
```

The payload **does** carry item content — that is the legitimate body of the
email the user would receive. Invariant 4 governs **logs/audit**, not the
email body; see the recipient/hashing decision below for the hard line
between the two.

## Service surface

Two new modules, plus one small internal helper. Signatures are exact.

### (a) Pure digest composer — `src/services/digest.js`

```js
/**
 * Compose a deterministic digest payload from a caller-supplied array of the
 * user's LIVE items. PURE: no store reads, no I/O, no clock, no randomness —
 * same input array always yields a deep-equal payload.
 *
 * The caller is responsible for scoping/filtering (this is fed the output of
 * listItems(userId), which is already user-scoped and deletedAt-filtered).
 * This function does NOT re-scope or re-filter — it must not duplicate that
 * logic (EM constraint).
 *
 * @param {{itemId:string, content:string}[]} items
 * @returns {DigestPayload}
 */
export function composeDigest(items) { /* ... */ }
```

- `itemCount = items.length`; `itemIds = items.map(i => i.itemId)`;
  `items` (payload) `= items.map(i => ({ itemId: i.itemId, content: i.content }))`.
- Order is **preserved from the input** (no sort — avoids the `item_10 <
  item_2` lexical trap; determinism comes from being a pure function of the
  input array).
- `subject` = `` `Your Stash digest: ${itemCount} saved item${itemCount === 1 ? "" : "s"}` ``.
- `body` — deterministic plain text: for `itemCount === 0`, a fixed
  zero-state line (e.g. `"You have no saved items right now."`); otherwise a
  fixed header followed by one `- ${content}` line per item, joined by `\n`.
- **Empty input is total, not exceptional:** returns a well-formed
  `itemCount: 0` payload. It never throws and never returns `null`.
- Exact prose of `subject`/`body` is **not** load-bearing; tests assert
  structure (count, IDs, each content present), so wording tweaks don't break
  them.

### (b) Orchestration — `src/services/digest.js`

```js
/**
 * Compose and attempt to send a digest of the user's live items.
 * Reuses listItems (user-scoped, deletedAt-filtered) and recordAuditEvent
 * (append-only, user-scoped) AS-IS.
 *
 * @param {string} userId
 * @param {string} recipient   Explicit recipient identifier (EM constraint:
 *                             no user-profile/email-directory lookup exists;
 *                             the caller supplies it).
 * @param {EmailAdapter} [adapter]  Defaults to a new PlaceholderEmailAdapter
 *                                  (throws). Injectable seam; the ONLY adapter
 *                                  that exists in src/ is the placeholder.
 * @returns {Promise<{ itemCount:number }>}  Resolves only on a real adapter
 *          success — UNREACHABLE in this build.
 * @throws {TypeError} on missing userId or recipient (before any audit/send).
 * @throws {Error} from adapter.send — always, in this build.
 */
export async function sendItemsDigest(userId, recipient, adapter = new PlaceholderEmailAdapter()) { /* ... */ }
```

Exact control flow (ordering is load-bearing — see Decision 1):

1. Guard `userId` — `if (typeof userId !== "string" || userId.length === 0) throw new TypeError("userId required")`.
2. Guard `recipient` — `if (typeof recipient !== "string" || recipient.length === 0) throw new TypeError("recipient required")`.
3. `const items = listItems(userId)` — reuse; user-scoped + live-only.
4. `const payload = composeDigest(items)`.
5. `const rHash = recipientHash(recipient)`.
6. **Emit the attempt event BEFORE the adapter call:**
   `recordAuditEvent(userId, "items.digest_send_attempted", { itemIds: payload.itemIds, itemCount: payload.itemCount, recipientHash: rHash })`.
7. `await adapter.send({ recipient, subject: payload.subject, body: payload.body })` — **throws** with the placeholder; the error propagates (not swallowed).
8. (Reachable only on a real success — unreachable in this build)
   `recordAuditEvent(userId, "items.digest_sent", { itemIds: payload.itemIds, itemCount: payload.itemCount, recipientHash: rHash })`.
9. `return { itemCount: payload.itemCount }`.

`recordAuditEvent` metadata carries **only** `itemIds`, `itemCount`,
`recipientHash`. The raw `recipient` string and all item content flow **only**
into `adapter.send(...)` — never into an audit event or a log.

### (c) EmailAdapter contract + placeholder — `src/services/emailAdapter.js`

```js
/**
 * @typedef {Object} EmailMessage
 * @property {string} recipient
 * @property {string} subject
 * @property {string} body
 *
 * @typedef {Object} EmailAdapter
 * @property {string} name
 * @property {(message: EmailMessage) => Promise<void>} send
 */

/**
 * The ONLY adapter in this build. Throws on every send; there is no config,
 * env var, or argument that suppresses the throw (approval scope: no real
 * send path exists). Message names the capability AND the adapter, per the
 * playbook's canonical throwing-placeholder pattern.
 */
export class PlaceholderEmailAdapter {
  constructor() {
    this.name = "email-adapter-boundary";
  }
  async send() {
    throw new Error(
      "Email sending is not configured in this build (PlaceholderEmailAdapter).",
    );
  }
}
```

`send` is `async` (a real provider send would be); it therefore **rejects**,
and callers use `await` / `assert.rejects`.

### Internal helper — `recipientHash` (in `digest.js`, exported for tests)

```js
import { createHash } from "node:crypto";
/**
 * One-way, truncated digest of the recipient string. node:crypto is a Node
 * core module — no new dependency (PROJECT_CONTEXT: dependency-free).
 * @param {string} recipient
 * @returns {string} 12 lowercase hex chars.
 */
export function recipientHash(recipient) {
  return createHash("sha256").update(String(recipient)).digest("hex").slice(0, 12);
}
```

## Resolved design questions (the two the EM flagged)

### Decision 1 — Audit semantics when the adapter always throws

**Chosen: two distinct event types.** `items.digest_send_attempted` is
emitted **once, before** the adapter call; `items.digest_sent` is emitted
**only after** a real `adapter.send()` success. In this build the placeholder
always throws, so the "sent" event is **unreachable** and the audit trail
shows an attempt with no matching success — which is exactly what happened.

Justification:

- **Invariant 3 ("every send-like action auditable") holds *in this build*.**
  The attempt event fires before the adapter throws, so the send-like action
  leaves an audit record even though nothing is delivered. Emitting the audit
  *after* the adapter call would mean the throw prevents the record — the
  action would be unauditable. Hence the ordering in step 6 is load-bearing.
- **No fake-success trail — structurally.** `items.digest_sent` is written
  **only** on the code path after `await adapter.send()` resolves. The
  placeholder can never resolve, so the placeholder can never produce a
  success-shaped event. "Success" is not a flag we set optimistically; it is a
  separate event reachable only by a real success. This is stronger than a
  naming convention — it is unreachable code for the placeholder.
- **Testable now.** The throw path asserts *exactly one*
  `items.digest_send_attempted` and *zero* `items.digest_sent` (see T-S2).
- **Forward-compatible.** When the rule-6 slice wires a real provider, the
  success event already exists and simply begins firing on real delivery — no
  audit redesign, no rename.

Rejected alternatives: **success-only / single-event-after-success** (nothing
would ever be audited in this build → invariant 3 fails and audit emission is
untestable); a **single `items.digest_sent` fired on attempt** (names a mere
attempt "sent" → a fake-success-shaped trail, the exact anti-pattern the
no-fake-success rule forbids); a **third `items.digest_send_failed` on throw**
(unnecessary — the attempt event plus the *absence* of the sent event already
encodes the outcome truthfully; kept to two types).

### Decision 2 — Recipient handling in logs/audit

**Chosen:** store a **one-way SHA-256 digest of the recipient string,
truncated to 12 hex chars** (`recipientHash`, via `node:crypto`), and store it
as the **only** recipient-derived value in audit metadata. The **raw recipient
string and all item content never appear** in any log or audit event
(invariant 4). The raw recipient and content are passed solely to
`adapter.send(...)`, which the placeholder discards by throwing.

- The hash is stable per recipient within a build (same address → same hash),
  so digests to one recipient can be correlated in the audit trail without the
  address ever being stored.
- SHA-256 is one-way; truncation reduces collision-resistance but the value is
  for correlation, not security-critical dedup, so 48 bits is ample.
- **Accepted risk:** an unsalted hash of a low-entropy input (an email
  address) could be confirmed by an attacker who *already* holds both the
  audit log and a candidate address list. This is acceptable here because the
  primary control is invariant 4 (the raw address is simply never stored), and
  no real addresses flow in this build. Salting is noted as a hardening for
  the **rule-6 slice**, when real recipients are introduced.

## Adapter boundaries

| Boundary | Default (and only) adapter | Placeholder behaviour |
|----------|----------------------------|-----------------------|
| Email send (`EmailAdapter.send`) | `PlaceholderEmailAdapter` | `async send()` **always throws** `"Email sending is not configured in this build (PlaceholderEmailAdapter)."` — no config/env/arg suppresses it. |

**Boundary integrity (for Security):** the shipped build (`src/`) constructs
**only** `PlaceholderEmailAdapter` — as the default parameter of
`sendItemsDigest`. No module under `src/` constructs a resolving adapter. The
only resolving adapter anywhere is a **local no-op test double** in
`test/digest.test.js` (used to prove the two-event design deterministically —
see T-S10); it performs no I/O and sends no mail. Verify with:
`grep -rn "Adapter" src/` → yields only `PlaceholderEmailAdapter`.

## Audit / usage events

| Event type | Emitted from | When | Metadata fields |
|------------|--------------|------|-----------------|
| `items.digest_send_attempted` | `digest.js:sendItemsDigest` | Once, **before** `adapter.send` | `itemIds`, `itemCount`, `recipientHash` |
| `items.digest_sent` | `digest.js:sendItemsDigest` | Once, **after** a real `send` success — **unreachable in this build** | `itemIds`, `itemCount`, `recipientHash` |

Both events are scoped to `userId` by `recordAuditEvent` (invariant 5, for
free via reuse). **Neither carries item content, title, subject, body, or the
raw recipient** (invariant 4).

## Integration points

- `src/services/savedItems.js` — `listItems(userId)`, read-only, reused
  **as-is** for user-scoped + live-only item retrieval. Not modified.
- `src/services/audit.js` — `recordAuditEvent(userId, type, metadata)`, reused
  **as-is**. Not modified.
- `node:crypto` (`createHash`) — Node core, for `recipientHash`. No new
  dependency.

No changes to `softDeleteItem`, `bulkDeleteItems`, `listItems`, or
`recordAuditEvent` behaviour (EM constraint).

## File plan

**3 new files, 0 modified.**

| File | Change | Contents |
|------|--------|----------|
| `src/services/emailAdapter.js` | new | `EmailAdapter`/`EmailMessage` typedefs + `PlaceholderEmailAdapter` (throws). |
| `src/services/digest.js` | new | `composeDigest(items)` (pure) + `sendItemsDigest(userId, recipient, adapter?)` + `recipientHash(recipient)`. Imports `listItems`, `recordAuditEvent`, `node:crypto`, and `PlaceholderEmailAdapter`. |
| `test/digest.test.js` | new | All cases below. Resets via existing `_reset` helpers. |

No `_reset` helper is needed in `digest.js`: it holds no module state of its
own (it reads via `listItems`, writes via `recordAuditEvent`, both already
resettable). This is what keeps the "0 modified" count true.

## Deterministic-first

- `composeDigest` is a pure function of its input array — no store, no clock,
  no randomness — so digest composition is fully unit-testable **without the
  adapter** and independent of the send (EM testability requirement; success
  criterion 1).
- Every test runs with **zero network** (no provider exists) and asserts the
  placeholder **throws**.
- `sendItemsDigest` separates composition (steps 3–4) from sending (step 7),
  so "composed correctly" is verifiable as its own step even though every send
  attempt throws.

## Test plan — `test/digest.test.js`

Node's built-in runner (`node:test` + `node:assert/strict`), mirroring
`test/savedItems.test.js` conventions; `resetItems()`/`resetAudit()` in each
case.

**Composer (pure, no adapter):**
- **T-C1** N live items → `itemCount === N`, `itemIds` equals input order,
  each item's `content` present in `payload.items`/`body`, `subject` reflects
  the count.
- **T-C2** Empty input → well-formed `itemCount: 0` payload (empty `itemIds`,
  empty `items`, zero-state body); does **not** throw, does **not** return
  `null`.
- **T-C3** Determinism → `composeDigest(x)` deep-equals `composeDigest(x)`
  (no time/randomness in the payload).

**Adapter:**
- **T-A1** `await assert.rejects(() => new PlaceholderEmailAdapter().send({...}), /not configured in this build/)`; also assert the message names the adapter (`/PlaceholderEmailAdapter/`). No argument makes it resolve.
- **T-A2** `new PlaceholderEmailAdapter().name` is the stable boundary name.

**`sendItemsDigest` — throw path (default placeholder):**
- **T-S1** `await assert.rejects(() => sendItemsDigest("u1", "u1@example.test"), /not configured in this build/)` — network-free.
- **T-S2** Before it throws: **exactly one** `items.digest_send_attempted` and
  **zero** `items.digest_sent` in `listAuditEvents("u1")` (invariant 3 on the
  attempt; no fake success).
- **T-S3** Attempt event metadata has **only** `itemIds`, `itemCount`,
  `recipientHash`; assert **no** `content`, `title`, `subject`, `body`, or
  `recipient` key present (invariant 4).
- **T-S4** `metadata.recipientHash === recipientHash("u1@example.test")` **and
  `!==` the raw recipient**; the raw recipient string appears nowhere in the
  event (stringify-and-search).

**`sendItemsDigest` — user scoping (invariant 5):**
- **T-S5** With items for `u1` and `u2`, `sendItemsDigest("u1", ...)` produces
  an attempt event whose `itemIds` are a subset of `u1`'s items and contain
  **none** of `u2`'s IDs — a user can never compose/send another user's items.
- **T-S6** That attempt event is visible under `listAuditEvents("u1")` and
  **not** under `listAuditEvents("u2")`.

**`sendItemsDigest` — empty items:**
- **T-S7** For a user with zero live items, one `items.digest_send_attempted`
  (`itemCount 0`, `itemIds []`) is emitted and the call then throws via the
  placeholder.

**`sendItemsDigest` — guards (mirror bulk-delete):**
- **T-S8** Empty/`null` `userId` → `assert.rejects`/throws `TypeError`; **no**
  audit event, **no** adapter call.
- **T-S9** Empty/missing `recipient` → `TypeError`; **no** audit event, **no**
  adapter call (guard precedes the attempt audit).

**`sendItemsDigest` — success path via injected no-op stub (differential):**
- **T-S10** Inject a **local resolving stub** (`{ name, async send() {} }` —
  no I/O) → the call resolves; then **exactly one** `items.digest_sent` fires,
  and its metadata has **only** `itemIds`/`itemCount`/`recipientHash` (no
  content). Proves (a) success is reachable **only** with a non-placeholder
  adapter — i.e. the placeholder is what blocks the send (differential vs
  T-S1), and (b) content leaks into **neither** event type. The stub lives
  only in the test file; `src/` never constructs it.

**Regression:**
- **T-R1** `test/savedItems.test.js` passes unmodified (0 files changed there).
- **T-R2** `npm run qa:mvp` (typecheck + full test) green, no network.

Maps to success criteria: SC1 → T-C1/T-C3; SC2 → T-A1/T-S1; SC3 →
T-S2/T-S3/T-S10; SC4 → T-S5/T-S6; SC5 → T-R1.

## Rollback plan

Pure addition (3 new files, 0 modified) → rollback is deletion, no migration.

1. Delete `src/services/emailAdapter.js`, `src/services/digest.js`,
   `test/digest.test.js`.
2. Nothing to revert in `savedItems.js`, `audit.js`, or `savedItems.test.js`
   — they were never touched.
3. No data migration: the audit log is in-memory + append-only; the two new
   `type` strings simply stop being produced. (In a future persisted store the
   two strings are additive — no backfill, no deletion of past rows.)
4. Equivalent one-shot: `git revert <implementation-commit>` removes exactly
   these three files and nothing else, because the slice touches nothing else.
5. Verify rollback: `npm run qa:mvp` green (only `savedItems.test.js` remains)
   and `grep -rn "digest" src/` returns nothing.

**No feature flag.** `sendItemsDigest` is a new export that nothing invokes
automatically — no cron, no route, no UI. There is no ambient exposure for a
flag to gate; the throwing placeholder is the safety and file deletion is the
rollback.

## Risks / open questions

- **Success-path code exists but is unreachable in this build** — accepted:
  it is present-but-dead for the placeholder, exercised only by a no-op test
  stub, and is *not* a phase 2. Security verifies no resolving adapter exists
  in `src/` (`grep -rn "Adapter" src/`).
- **Unsalted recipient hash** — accepted for this build (see Decision 2);
  salting deferred to the rule-6 slice when real addresses flow.
- **No open product/UX questions.** Recipient is an explicit parameter (no
  profile subsystem); empty-digest policy resolved (compose count-0, still
  attempt+throw). Nothing here requires splitting the slice.

## Hand off

**Next agent: Backend Architect (Implementation).** Produce the 3 files above
and the targeted tests exactly per this spec, in one focused commit; then run
`npm run qa:mvp`. Do **not** wire a real provider or remove the placeholder's
throw (rule-6, not approved). Then QA Evidence → Security & Privacy → Release.
