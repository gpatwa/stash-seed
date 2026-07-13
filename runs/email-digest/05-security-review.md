# Security & Privacy Review — email-digest

> Stage 5 · Owner: Security & Privacy Agent
> Status: reviewed — PASS
> Source diff: `09bd4c4982a6ebbe2cc17a32d6a8d7576520ad54` ("Implement email-digest composer, adapter boundary, and orchestration"), branch `slice/email-digest`, parent `60d7f2b`.
> Inputs read: agent def, `docs/HUMAN_APPROVAL_RULES.md`, `.agentic/SAFETY_INVARIANTS.md`, `runs/email-digest/04-qa-evidence.md`, `runs/email-digest/APPROVAL_RECORD-1.md`, and the raw diff. Independent greps/reads run against the working tree — not a re-read of QA's evidence.

## Verdict

**PASS — recommend release.** No blocker, no required-fix. One advisory, which converts into hard preconditions on the future real-provider (rule-6) slice. This build ships a pure composer, a throwing adapter boundary, and orchestration that reuses `listItems`/`recordAuditEvent` unchanged. No real send path exists; the approved scope (rule-1, placeholder only) is respected exactly.

## Findings

| # | Severity | Area | Finding | Disposition |
|---|----------|------|---------|-------------|
| F-1 | **advisory** | PII de-identification | `recipientHash` is an **unsalted** SHA-256 of the raw recipient string, truncated to 12 hex chars (48 bits) (`src/services/digest.js:53-55`). Email addresses are low-entropy and enumerable, so for *real* addresses this is offline-reversible (dictionary/rainbow) and not a durable de-identifier. **Not exploitable in this build** — no real recipient flows (see F-1 rationale below) — so it is an accepted risk *now*, but it must be fixed before any real address is introduced. | Accept for this build; **precondition P-2** on the rule-6 slice. |
| F-2 | advisory (informational) | Content in payload | `composeDigest` returns `payload.items[].content` and renders raw content into `payload.body` (`src/services/digest.js:29-42`). This is correct — content must reach the message — and it flows **only** to `adapter.send(...)`, never to audit. Flagged so the rule-6 engineer knows the real adapter will receive user content and must not log/persist it. | No action now; **precondition P-3** on the rule-6 slice. |

No blocker-severity or required-fix-severity findings. Per the agent's operating constraint ("Block on any blocker-severity finding; don't pass with caveats"), neither advisory is a caveat on a blocker — both are forward-looking hardening items scoped out of the approved slice.

## Independent checks (each its own pass)

### 1. Secrets / credentials — CLEAN
- `git show 09bd4c4 | grep -Ei 'sk-|Bearer|AKIA|-----BEGIN|api_key|password|secret[:=]'` on added lines → no matches.
- No `.env` / credential file added; `package.json` diff empty (no dependency).
- Only "secret"-shaped string in the diff is the test fixture `addItem("u1", "secret content")` (`test/digest.test.js`), used deliberately to prove content does **not** leak — not a credential.

### 2. Item content / raw recipient in any log or audit path (invariant 4) — HOLDS
- Both `recordAuditEvent` calls pass metadata `{ itemIds, itemCount, recipientHash }` only (`src/services/digest.js:93-97`, `:107-111`) — no `content`/`title`/`subject`/`body`/`recipient` key.
- Raw `recipient`, `subject`, and content-bearing `body` flow **only** into `adapter.send({recipient, subject, body})` (`digest.js:99-103`) — and the sole adapter throws before touching them.
- No `console.*` anywhere in the new files; `recordAuditEvent` (`audit.js:10-20`) writes to an in-memory array and never logs. No sink exists that could emit content.
- The thrown error is a fixed string naming only the capability/adapter (`emailAdapter.js:24-26`) — carries no recipient or content.
- **recipientHash verdict:** I concur with QA that the unsalted hash is an **accepted (non-blocking) risk for this build**, and I add a hard precondition for the rule-6 slice — see "Verdict on QA accepted-risk items" and P-2.

### 3. Approval-scope integrity (rule-1 scope; rule-5-adjacent adapter boundary) — HOLDS
The rule-1 approval (`APPROVAL_RECORD-1.md`) covers a throwing placeholder only. Independently verified no real send path exists:
- **No network imports** anywhere in `src/`: `grep -rEi 'http|https|net|tls|smtp|nodemailer|axios|fetch|require\('` over `src/` → none. `digest.js` imports only `node:crypto` (+ 3 local modules); `emailAdapter.js` imports nothing. The diff-level grep matches are all prose/comments/commit-message text, not code.
- **No env-var provider config**: `grep -rEi 'process\.env|dotenv|API_KEY|TOKEN|credential'` over `src/` → none. There is no config/env/argument that suppresses the throw (`emailAdapter.js:19-27`).
- **Only `EmailAdapter` implementation in `src/` is the throwing placeholder**: `grep -rnE 'class .*Adapter|async send' src/` → only `PlaceholderEmailAdapter` (`emailAdapter.js:19`) whose `send()` unconditionally throws (`:23-26`). `EmailAdapter` is a JSDoc typedef, not a class. The only resolving adapter in the repo is an inline test stub in `test/digest.test.js`, never imported by `src/`.
- **`items.digest_sent` is unreachable in the shipped build**: it is recorded only on the line *after* `await adapter.send(...)` resolves (`digest.js:99-111`). With the default `PlaceholderEmailAdapter`, `send()` throws and the error propagates — control never reaches line 107. Only a resolving adapter injected via the optional 3rd param reaches it, and none exists outside test files. The differential (T-S10 / QA probe b) confirms the event is genuinely wired (reachable with a resolving stub), i.e. not accidentally dead — the placeholder is the sole gate.

### 4. Audit coverage — HOLDS
- `items.digest_send_attempted` fires **exactly once per past-guard invocation**: unconditional, no loop/retry, after both guards and **before** `adapter.send` (`digest.js:93-97`). Load-bearing ordering keeps invariant 3 true despite the placeholder throwing.
- **No fake-success trail possible**: `items.digest_sent` is emitted only after a genuine `adapter.send` resolve; there is no `catch` swallowing the throw and recording success. Throw path → 1 attempted / 0 sent (T-S2, probe a).
- **Guard failure emits nothing**: bad `userId`/`recipient` throws `TypeError` before any audit event (`digest.js:79-84`; T-S8/T-S9 → 0 events) — correct: an attempt is only logged once composition begins.
- **No existing audit event removed or weakened**: `audit.js` and `savedItems.js` are **not in this commit** (`git show --name-status 09bd4c4` → only `digest.js`, `emailAdapter.js`, `test/digest.test.js`, and two run-artefacts). `items.deleted` / `items.bulk_deleted` are byte-for-byte unchanged.

### 5. User-scoping — HOLDS
- `sendItemsDigest(userId, ...)` reads items via `listItems(userId)` (`digest.js:86`), which is already `userId`-scoped and `deletedAt`-filtered (`savedItems.js:17-21`). A digest can never include another user's items.
- `composeDigest(items)` takes **no** `userId` and does no re-scoping — it maps only the array handed to it (`digest.js:29-46`); it cannot pull in a foreign user's items.
- Both audit events use the same `userId` (`digest.js:93`, `:107`); `recordAuditEvent` stamps `event.userId` and `listAuditEvents(userId)` filters by it (`audit.js:11-24`). Audit events land only in the caller's scope. Confirmed by T-S5/T-S6 and QA probe d.

### 6. Regression — invariants 1-5 on pre-existing delete paths — HOLDS
`savedItems.js` and `audit.js` are untouched by this commit (proven in check 4), so the delete paths are unchanged. I spot-checked the source directly and QA's evidence stands:
- **Inv 1 (soft/recoverable):** `softDeleteItem` sets `deletedAt` and never removes from the Map (`savedItems.js:29-32`).
- **Inv 2 (multi-item confirmed = explicit ID list):** `bulkDeleteItems` rejects non-array/empty (`savedItems.js:48-50`); no broad-filter delete exists.
- **Inv 3 (every delete audited):** `items.deleted` per item (`:31`), one `items.bulk_deleted` summary (`:63-69`).
- **Inv 4 (no content in audit):** delete metadata is `{itemId}` / counts + IDs only (`:31`, `:63-69`).
- **Inv 5 (own items only):** `softDeleteItem` rejects `item.userId !== userId` (`:29`); bulk delegates per-ID through it.

## Per-invariant confirmation (this slice)

| Invariant | Verdict | Basis |
|-----------|---------|-------|
| 1. Deletes soft/recoverable | HOLDS | Slice adds no delete path; delete code unchanged (check 6). |
| 2. Multi-item destructive confirmed | HOLDS | `sendItemsDigest` deletes nothing; `bulkDeleteItems` guard unchanged (check 6). |
| 3. Every send/delete audited | HOLDS | Attempt event before send, once, unconditionally (check 4). |
| 4. No item content in logs/audit | HOLDS | Metadata is IDs/count/hash only; content/recipient reach only the throwing adapter (check 2). |
| 5. User only affects own items | HOLDS | `listItems(userId)` scoping reused; `composeDigest` has no `userId` (check 5). |

Adapter-boundary integrity (rule-5-adjacent): **no placeholder became a real client** — the sole `src/` adapter still throws; no network/env/config seam exists (check 3).

## Verdict on the two QA accepted-risk items

1. **Unsalted `recipientHash` (SHA-256, 12-hex/48-bit, no salt).** **Concur — accepted (non-blocking) for this build.** Rationale: (a) no real recipient flows in this build — `sendItemsDigest` is invoked by nothing in `src/` (no route/cron/UI); recipients are caller-supplied and, in practice here, only test literals like `u1@example.test`; (b) the primary invariant-4 control is that the raw address is *never stored at all* — only the derived hash is — and that holds; (c) the hash exists for event correlation, not secrecy. It is genuinely weak as a de-identifier for *real* addresses (offline-reversible; see F-1), so acceptance is strictly conditional on no real recipient being present — which is true today. **Precondition P-2 makes salting/rethinking mandatory before the rule-6 slice.**

2. **`items.digest_sent` success path unreachable ("dead-for-now").** **Concur — not a gap.** It is not pejorative dead code: it is guard-gated behind the throwing placeholder and is provably reachable the instant a resolving adapter is injected (differential T-S10 / probe b prove it is correctly wired, not silently broken). Keeping it in place is the right call — the rule-6 slice then only swaps the adapter, leaving audit ordering and metadata shape already reviewed. Accepted.

## Preconditions for a future real-provider (rule-6) slice

Before any real email provider is wired or real sends are enabled, ALL of the following must be satisfied — none are optional:

- **P-1 — Fresh rule-6 approval + vendor risk assessment.** A real provider is a new third-party data processor (rule 6). Requires explicit human approval, a completed `templates/VENDOR_RISK_TEMPLATE.md`, DPA status surfaced, and a data-classification note (recipient = PII; subject/body may contain user-generated content). The standing rule-1 approval here is scoped explicitly to the placeholder only, so a real send also needs its own rule-1 gate — it does not carry over.
- **P-2 — Salt (or drop) `recipientHash` before real addresses flow.** Replace the unsalted SHA-256 with a keyed/salted digest (e.g. HMAC-SHA-256 with a secret salt from the environment) and reconsider the 48-bit truncation; or store no recipient derivative if correlation is not required. Shipping the current hash against real addresses turns the audit log into a reversible map of user emails.
- **P-3 — Real adapter must honour invariant 4 itself.** The concrete adapter receives raw `recipient`, `subject`, and content-bearing `body`. Security must review that adapter for content/PII in its own logs, error messages, retries, and telemetry — the boundary-4 guarantee currently rests on the adapter never persisting/logging.
- **P-4 — Explicit per-send approval gate at the call site.** Nothing invokes `sendItemsDigest` today. Whatever trigger is added (route/cron/job) must present an explicit user approval gate per rule 1; it must not be a standing config/feature-flag toggle that disables the gate (rule 4).
- **P-5 — Config must fail closed.** Any env/provider config must throw on missing/invalid config, never silently no-op or fall back to a real send. Secrets come from the environment/secret manager — never inlined (rule-4/secret-hygiene).
- **P-6 — Re-audit send semantics under a real provider.** Confirm attempted-before-send ordering is preserved and that a provider failure after acceptance cannot produce a `digest_sent` without a genuine success signal (no optimistic/fake success).

## Recommendation

- [x] **Pass to Release Manager** — safe to release within the approved rule-1 scope (placeholder adapter, no real send).
- [ ] Block — return to engineer.

Rationale: all six independent checks pass; every safety invariant this slice touches holds, with the pre-existing delete-path invariants unchanged (delete modules not in the commit); no secret, no PII-in-audit, no approval bypass, no placeholder-turned-real-client. The two advisories are forward-looking hardening items captured as preconditions P-1..P-6 on the next slice, not release blockers.

## Hand off

Next agent: Release Manager. Verify `APPROVAL_RECORD-1.md` before landing; carry preconditions P-1..P-6 forward to the deferred rule-6 slice.
