# Release Checklist — email-digest

> Stage 6 · Owner: Release Manager Agent
> Tier: **3**
> Model: opus (Tier-3 slice, per `.claude/protocols/MODEL_ROUTING.md`)
> Source diff: `09bd4c4982a6ebbe2cc17a32d6a8d7576520ad54` ("Implement
> email-digest composer, adapter boundary, and orchestration"), branch
> `slice/email-digest`, parent `60d7f2b`.
> Source artefacts: `runs/email-digest/00-slice-plan.md`,
> `01-em-scope.md`, `02-architecture.md`, `03-impl-notes.md`,
> `04-qa-evidence.md`, `05-security-review.md`, `APPROVAL_REQUEST-1.md`,
> `APPROVAL_RECORD-1.md`, `STATE.md`. Gates walked against
> `docs/RELEASE_GATES.md`; approval against `docs/HUMAN_APPROVAL_RULES.md`.

This slice produces a checklist and a decision. The Release Manager does
**not** write code and does **not** push, merge, or deploy. Per
`docs/HUMAN_APPROVAL_RULES.md` rule 3, the actual landing (merge to `main`)
is a deploy-adjacent action performed by the **human**, not by the run.

## Tier classification rationale

**Tier 3 — confirmed.** Per `docs/RELEASE_GATES.md`, Tier 3 is any change
"to anything that sends, submits, posts, publishes, pushes, deploys, or
destroys." This slice introduces a **send-on-behalf-of-a-user capability**
(`sendItemsDigest` — email a user their saved items), which trips
`docs/HUMAN_APPROVAL_RULES.md` rule 1. The tier is set by *introducing the
capability*, not by whether a message actually leaves the process: the sole
adapter (`PlaceholderEmailAdapter`) throws unconditionally and no real
provider is wired, yet standing up the send-on-behalf seam is itself the
Tier-3 trigger — which is exactly why a human approval was obtained at
intake (`APPROVAL_RECORD-1.md`). Downgrading to Tier 2 now because "the
placeholder makes it safe" would be the "treat Tier 3 as Tier 2 because it
feels safe" anti-pattern the role brief forbids. Tier 3 stands, matching the
slice plan (`00-slice-plan.md`) and the EM scope (`01-em-scope.md`).

## Gates

Every gate from `docs/RELEASE_GATES.md`, walked top to bottom for Tier 3.
Each is marked pass, or n/a with a one-line reason and the artefact that
proves it.

### Scope

- [x] Slice fits in one implementation pass — `01-em-scope.md` ("~3 new
  files, 0 modified… One implementation pass. No split required."),
  confirmed shipped as one commit (`03-impl-notes.md`, `04-qa-evidence.md`).
- [x] Non-goals are explicit — `01-em-scope.md` "Explicit non-goals" and
  `02-architecture.md` (no real provider, no scheduling, no unsubscribe, no
  UI, no changes to `savedItems.js`/`audit.js`).

### Discovery

- [x] Success criteria are observable — met via `00-slice-plan.md`
  "Success criteria" and `01-em-scope.md` "Success criteria (measurable)"
  (SC1–SC5, each unit-testable), each mapped to a named test in
  `02-architecture.md` and shown green in `04-qa-evidence.md`. No PRD exists
  because Discovery/PM was compressed out at intake (internal,
  well-understood ask — `01-em-scope.md` stage decision); the *requirement*
  the gate protects (observable, checkable criteria) is satisfied by the
  slice plan + EM scope in the PRD's place.

### Architecture

- [x] Adapter boundaries identified — `02-architecture.md` "Adapter
  boundaries" (`EmailAdapter` seam; only `PlaceholderEmailAdapter`, throws).
- [x] Audit / feedback / usage events listed — `02-architecture.md`
  "Audit / usage events" (two additive event types:
  `items.digest_send_attempted`, `items.digest_sent`; metadata =
  `itemIds`/`itemCount`/`recipientHash`).

### Implementation

- [x] Typecheck passed — `03-impl-notes.md` + `04-qa-evidence.md` step 1
  (`npm run typecheck` → "typecheck ok"; globs `src/services/*.js`, picks up
  both new modules).
- [x] Targeted tests passed — `04-qa-evidence.md` step 2
  (`node --test test/digest.test.js` → 15/15).
- [x] Full test suite passed — `03-impl-notes.md` + `04-qa-evidence.md`
  step 3 (`npm test` → 27/27; 12 pre-existing + 15 new; independently
  reproduced by QA).
- [x] Build passed — `03-impl-notes.md` + `04-qa-evidence.md` step 4
  (`npm run build` → "build ok").
- [x] One commit per task — one task (the slice) = one commit `09bd4c4`
  (`03-impl-notes.md` "one focused commit"; `04-qa-evidence.md` diff check
  confirms a single implementation commit).
- [x] No new lint warnings (`git diff --check`) — `04-qa-evidence.md`
  step 6 (`git diff --check` and `git show 09bd4c4 --check` both exit 0, no
  output).

### QA

- [~] UI verified in preview where observable — **n/a (nothing
  observable).** Backend-only slice: `sendItemsDigest`/`composeDigest`/
  `PlaceholderEmailAdapter` are new exports with no route, no UI, no cron —
  nothing invokes them automatically, and the seed has no view layer
  (`04-qa-evidence.md` "UI verification: Not applicable"; `01-em-scope.md`
  "no UI (none exists)"). There is no preview surface to screenshot.
- [x] Local regression command passed — `04-qa-evidence.md` step 5
  (`npm run qa:mvp` → typecheck ok + 27/27, network-free).
- [x] Safety invariants verified — `04-qa-evidence.md` "Safety invariant
  verification" (invariants 1–5 each pass, cited to code line and/or
  independently-run test/probe), corroborated by `05-security-review.md`
  "Per-invariant confirmation".

### Security

- [x] No secrets / credentials in diff — `05-security-review.md` check 1
  (CLEAN; no `.env`, empty `package.json` diff, the only "secret"-shaped
  string is a deliberate test fixture proving content does not leak).
- [x] No PII / sensitive data logged — `05-security-review.md` check 2
  (invariant 4 HOLDS: audit metadata is `itemIds`/`itemCount`/
  `recipientHash` only; raw recipient + item content flow **only** into the
  throwing `adapter.send`, never to audit/logs; no `console.*` added).
- [x] Audit events cover state changes — `05-security-review.md` check 4
  (`items.digest_send_attempted` fires once, unconditionally, **before**
  `adapter.send`, so the send-like action is auditable even though the
  placeholder throws; no fake-success trail; guard failures emit nothing).
- [x] Adapter boundary placeholder still throws — `05-security-review.md`
  check 3 (only `PlaceholderEmailAdapter` constructed in `src/`; `send()`
  throws unconditionally; no network/env/config seam suppresses it;
  `items.digest_sent` is unreachable in the shipped build). Verified by
  T-A1/T-S1 and QA probe (a).

### Release

- [x] Human approval points satisfied — `APPROVAL_RECORD-1.md` (rule 1,
  APPROVED). See "Approval verification" below (the critical gate).
- [x] Rollback plan exists — `02-architecture.md` "Rollback plan",
  confirmed against the actual diff below.
- [x] Release checklist filled — this artefact
  (`runs/email-digest/06-release-checklist.md`).

### Tier 3 only

- [x] Human approval obtained per `docs/HUMAN_APPROVAL_RULES.md` —
  `APPROVAL_RECORD-1.md`, verified in detail below.
- [x] Approval recorded — **who:** gpatwa (human operator);
  **when:** 2026-07-13T06:04Z (UTC); **exact request:** the structured
  prompt in `APPROVAL_REQUEST-1.md` / restated verbatim in
  `APPROVAL_RECORD-1.md` ("approve building `sendItemsDigest(userId)`
  against a placeholder email adapter that THROWS by default? No real
  emails… enabling real sends would come back as a separate rule-6
  approval."); **exact response:** "Approve (Recommended)" selected from
  [Approve (Recommended) / Approve, no titles / Deny].
- [x] Dry-run passed on fixture — **Tier-3 adaptation:** no live surface
  exists (nothing invokes the function; no provider, route, or cron), so the
  fixture-backed **test suite (27/27) plus the independent QA runtime probe**
  (`04-qa-evidence.md` "Runtime probe", sections a–e all PASS, zero network)
  *is* the dry-run. It exercises the throw path, the differential
  resolving-stub success path, leak-freedom, cross-user isolation, and an
  invariants-1–5 regression — all against fixtures, no external effect.
- [x] Audit event coverage manually verified — `04-qa-evidence.md` probe
  (a)/(b) differential (default placeholder: 1 attempted / 0 sent; injected
  no-op stub: 1 attempted / 1 sent — the only variable is the adapter) and
  `05-security-review.md` check 4. Independently reproduced, not re-read.
- [x] Post-launch monitoring plan exists — see "Post-launch monitoring"
  below.

### Enterprise & governance gates

**All n/a — no overlay roles enabled for this slice.** Project pack is
`b2c-saas` (`STATE.md`), not an enterprise overlay; the run's stage list
(Scope → Architecture → Implementation → QA → Security → Release →
Post-Launch) instantiates no Data Governance, Security & Privacy overlay,
Compliance Reviewer, AI Governance, FinOps, SRE, Tech Writer, or CAB role,
so none of the `docs/RELEASE_GATES.md` "Enterprise & governance gates"
apply. Stated once per the doc's convention. (The one that would otherwise
be relevant — "new subprocessor risk-assessed + DPA in place" — is n/a
*because no subprocessor ships in this diff*; it becomes mandatory for the
deferred rule-6 slice and is captured as precondition **P-1** below.)

### Skipped / n/a gates

| Gate | Reason | Marked by |
|------|--------|-----------|
| QA — UI verified in preview | Backend-only; no route/UI/cron, seed has no view layer — nothing observable to preview (`04-qa-evidence.md`). | Release Manager |
| Enterprise & governance gates (all) | No overlay roles enabled; `b2c-saas` pack, no enterprise overlay in this run (`STATE.md`, `docs/RELEASE_GATES.md`). | Release Manager |
| (Compressed stages, not release gates) Market Research; Discovery/PM; UX/UI Design | Skipped at intake / by EM: internal well-understood ask, no open product question, headless seed with no UI layer (`01-em-scope.md` stage decision). Observable-success-criteria requirement still met via slice plan + EM scope. | EM (recorded), Release Manager (confirmed) |

No skipped gate lacks a reason. No **failed** gate. Failure budget: 0/2
used across all stages (`STATE.md`).

## Approval verification (critical)

The Tier-3 release gate turns on this. Verified against
`docs/HUMAN_APPROVAL_RULES.md` and cross-checked with the security review's
approval-scope-integrity check (`05-security-review.md` check 3).

1. **Record exists and is explicit.** `APPROVAL_RECORD-1.md` records
   Decision = **APPROVED**, approver = gpatwa (human), when =
   2026-07-13T06:04Z, with the human's verbatim response ("Approve
   (Recommended)") to a specifically-worded question. This satisfies "What
   'explicit approval' means": a direct, unambiguous yes to the specific
   request just made — not inferred from "looks good", not carried over from
   a prior request, not batched. The record even notes an earlier batched
   "do all" instruction was **not** treated as approval, and a discrete
   prompt was issued instead — the correct behaviour.
2. **Request was well-formed.** `APPROVAL_REQUEST-1.md` presents all four
   "How to ask for approval" elements — what (build `sendItemsDigest`
   against a throwing placeholder), why (rule 1), what's reversible (all of
   it; one revert), and the smallest request (placeholder only; real
   provider explicitly excluded).
3. **Approval matches the shipped diff scope — exactly.** Approved scope =
   "build `sendItemsDigest(userId)` against a placeholder email adapter that
   **throws by default** — no real emails, no email provider wired." The
   shipped diff (`09bd4c4`) is exactly three added files —
   `src/services/emailAdapter.js` (throwing `PlaceholderEmailAdapter`),
   `src/services/digest.js`, `test/digest.test.js` — 0 modified
   (`04-qa-evidence.md` diff check). The security review independently
   proved no real send path exists: no network/SMTP imports, no
   `process.env`/provider config, only `PlaceholderEmailAdapter` in `src/`
   with an unconditional throw, and `items.digest_sent` unreachable in this
   build (`05-security-review.md` check 3). Shipped scope ⟺ approved scope.
4. **Deferred rule-6 approval is clearly recorded as NOT requested.**
   `APPROVAL_RECORD-1.md` "Explicitly NOT approved (deferred): wiring any
   real email provider or enabling real sends — returns as a separate
   request under rule 6." `STATE.md` approvals table lists "Wire a real
   email provider + enable real sends | 6 | **not yet** | deferred". No
   ambiguity: the rule-6 approval has not been requested and does not carry
   over from the rule-1 approval.
5. **No other rule 1–6 action ships in this diff.** Walked all six:
   - Rule 1 (send/submit on behalf): the only send-like path is
     `sendItemsDigest`, gated by the throwing placeholder — **approved**; no
     actual send occurs.
   - Rule 2 (destructive ops on shared state): slice adds no delete/destroy
     path (`04` inv 1/2; `05` check 6). None ships.
   - Rule 3 (external-effect via deploy/release): the run performs no
     deploy/merge/push — the landing is the human's action (see Decision).
     None ships.
   - Rule 4 (changes to safety controls): no gate/audit disabled, no gate
     skipped in code, no `--no-verify`; the slice *adds* audit events and a
     throwing guard. None ships.
   - Rule 5 (LLM/real client into a deterministic path): placeholder still
     throws; no real client, no network in build/test (`05` check 3).
     None ships — the boundary is rule-5-adjacent but explicitly untripped.
   - Rule 6 (new third-party data processor): deferred; no provider wired.
     None ships.

**Approval-verification result: PASS.** The single rule-triggering action
(rule 1 — introducing the send-on-behalf capability) is explicitly approved,
scoped to the placeholder, and matches the shipped diff; nothing else gated
ships; rule 6 is cleanly deferred.

## Rollback plan

Lifted from `02-architecture.md` and confirmed against the actual diff
(`09bd4c4`, independently shown to be 3 added / 0 modified under
`src/`,`test/` in `04-qa-evidence.md`). Executable from these artefacts
alone — the exact file paths, commit SHA, and verification command are all
recorded here.

1. Delete the three new files: `src/services/emailAdapter.js`,
   `src/services/digest.js`, `test/digest.test.js`.
2. Nothing to revert in `savedItems.js`, `audit.js`, or
   `savedItems.test.js` — this slice never touched them (0 modified).
3. No data migration: the audit log is in-memory + append-only; the two new
   `type` strings simply stop being produced. Additive, no backfill.
4. One-shot equivalent: `git revert 09bd4c4` removes exactly these three
   source/test files because the slice touches nothing else in `src/test`.
   (Note: commit `09bd4c4` also added `runs/email-digest/03-impl-notes.md`
   and modified `runs/email-digest/STATE.md` — pipeline run-artefacts, not
   shipped code; a `git revert` would also revert those, which does not
   affect the running system. The clean product rollback is deleting the
   three files in step 1.)
5. Verify rollback: `npm run qa:mvp` green (only `savedItems.test.js`
   remains, 12/12) and `grep -rn "digest" src/` returns nothing.

No feature flag: nothing invokes `sendItemsDigest` automatically (no cron,
route, or UI), so there is no ambient exposure to gate — the throwing
placeholder is the safety and file deletion is the rollback.

## Post-launch monitoring (Tier 3)

No deploy and no live surface exist (nothing calls `sendItemsDigest`), so
monitoring here is **audit-signal watching**, not service metrics:

- **Primary signal — `items.digest_sent` must NEVER appear in this build.**
  It is structurally unreachable behind the throwing placeholder
  (`05-security-review.md` check 3). If a `items.digest_sent` audit event
  ever materialises before the rule-6 slice lands, it means a resolving
  adapter was wired without approval — a rule-1/rule-6 breach. **Threshold:
  any single occurrence is a page.**
- **Secondary signal — unexpected `items.digest_send_attempted`.** Nothing
  should invoke `sendItemsDigest` automatically today. Any attempt event in
  the audit log means a new call site appeared; confirm it is an intended,
  approved caller (and that the rule-4 per-send approval gate — precondition
  **P-4** — is in place before any real trigger is added). **Threshold: any
  attempt from a non-test caller warrants review.**
- **Metadata hygiene check.** On any real digest event, re-confirm metadata
  carries only `itemIds`/`itemCount`/`recipientHash` — no content or raw
  recipient (invariant 4).
- **Owner:** Post-Launch Learning Agent (runs after the slice lands).

## Preconditions carried forward to the deferred rule-6 slice

Per `05-security-review.md`, these are **hard, non-optional** preconditions
on any future slice that wires a real email provider / enables real sends.
Carried here as standing gate items for that slice:

- **P-1 — Fresh rule-6 approval + vendor risk assessment.** A real provider
  is a new third-party data processor: explicit human approval, completed
  `templates/VENDOR_RISK_TEMPLATE.md`, DPA status surfaced, data
  classification (recipient = PII; subject/body may carry user content). The
  rule-1 approval here is placeholder-scoped and does **not** carry over — a
  real send needs its own rule-1 gate too.
- **P-2 — Salt (or drop) `recipientHash` before real addresses flow.**
  Replace the unsalted 12-hex SHA-256 (offline-reversible for real
  low-entropy email addresses) with a keyed/salted digest (e.g.
  HMAC-SHA-256 with an environment secret) and reconsider the truncation, or
  store no recipient derivative.
- **P-3 — Real adapter must honour invariant 4 itself.** The concrete
  adapter receives raw `recipient`/`subject`/content-bearing `body`;
  Security must review it for content/PII in its own logs, error messages,
  retries, and telemetry.
- **P-4 — Explicit per-send approval gate at the call site.** Any trigger
  added (route/cron/job) must present a per-send rule-1 approval gate; it
  must not be a standing config/flag that disables the gate (rule 4).
- **P-5 — Config must fail closed.** Provider config throws on
  missing/invalid config, never silently no-ops or falls back to a real
  send; secrets come from the environment/secret manager, never inlined.
- **P-6 — Re-audit send semantics under a real provider.** Confirm the
  attempted-before-send ordering holds and that a provider failure after
  acceptance cannot produce a `digest_sent` without a genuine success
  signal (no optimistic/fake success).

## Decision

- [x] **GO** — all gates pass or are n/a with a recorded reason; approval
  verified (rule 1, scoped, matches the diff); rollback confirmed
  executable; no unapproved gated action ships.
- [ ] No-go.

**What GO authorizes — and what it does not.** This GO **recommends** that
the human land the slice by **merging branch `slice/email-digest` to `main`
via PR**. It does **not** perform, push, merge, or deploy anything. The
merge is a `docs/HUMAN_APPROVAL_RULES.md` **rule-3** deploy-adjacent /
release action, which stays with the **human**; the run does not merge. The
Release Manager's role output is a checklist and a decision only. The human
performing the merge is themselves the rule-3 action-taker — the run
captures no separate "deploy approval" because the gated action is executed
directly by the human, not automated.

**Recorded:** the **human** performs the merge to `main`. The autonomous run
stops at this GO recommendation.

## Hand off

- **On merge (by the human):** hand off to the Post-Launch Learning Agent,
  which watches the audit signals above once the slice has landed.
- **Rule-6 slice (whenever a real provider is proposed):** starts from
  preconditions P-1..P-6; requires fresh rule-6 (and rule-1) human approval
  — not yet requested.
